"""
WebSocket Hub for Cross-Client MPV Control
Allows multiple clients (phone, tablet, desktop) to control a single MPV instance
"""

from fastapi import WebSocket, WebSocketDisconnect
from typing import Set, Dict, Optional
import asyncio
import json
import logging
from datetime import datetime

logger = logging.getLogger("mpv_hub")


class MPVControlHub:
    """
    Central hub for managing MPV control across multiple clients.
    Handles WebSocket connections and broadcasts state updates.
    """
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.current_state: Dict = {
            "playing": False,
            "paused": True,
            "time_pos": 0.0,
            "duration": 0.0,
            "filename": None,
            "playlist_pos": 0,
            "playlist_count": 0,
            "volume": 100,
            "speed": 1.0,
            "last_update": None,
        }
        self._state_lock = asyncio.Lock()
        self._polling_task = None
    
    async def connect(self, websocket: WebSocket):
        """Register a new client connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Client connected. Total: {len(self.active_connections)}")
        
        # Send current state to new client
        await websocket.send_json({
            "type": "state",
            "data": self.current_state
        })
        
        # Start polling if this is the first connection
        if len(self.active_connections) == 1:
            self.start_polling()
    
    def disconnect(self, websocket: WebSocket):
        """Unregister a client connection."""
        self.active_connections.discard(websocket)
        logger.info(f"Client disconnected. Total: {len(self.active_connections)}")
        
        # Stop polling if no connections left
        if len(self.active_connections) == 0:
            self.stop_polling()
    
    async def broadcast(self, message: dict, exclude: Optional[WebSocket] = None):
        """
        Broadcast message to all connected clients.
        
        Args:
            message: Message to broadcast
            exclude: Optional websocket to exclude from broadcast
        """
        disconnected = set()
        
        for connection in self.active_connections:
            if connection == exclude:
                continue
            
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn)
    
    async def update_state(self, updates: dict):
        """
        Update current state and broadcast to all clients.
        
        Args:
            updates: Dictionary of state updates
        """
        async with self._state_lock:
            self.current_state.update(updates)
            self.current_state["last_update"] = datetime.now().isoformat()
        
        await self.broadcast({
            "type": "state",
            "data": self.current_state
        })
    
    async def handle_command(self, command: dict, sender: WebSocket):
        """
        Handle command from client and execute via MPV IPC.
        
        Args:
            command: Command dictionary with 'action' and optional 'params'
            sender: WebSocket that sent the command
        """
        from .mpv_control import send_mpv_command
        
        action = command.get("action")
        params = command.get("params", {})
        
        logger.info(f"Received command: {action} with params: {params}")
        
        try:
            # Map actions to MPV IPC commands
            if action == "play_pause":
                await send_mpv_command(["cycle", "pause"])
                # Toggle state
                new_paused = not self.current_state["paused"]
                await self.update_state({
                    "paused": new_paused,
                    "playing": not new_paused
                })
            
            elif action == "seek":
                seconds = params.get("seconds", 0)
                await send_mpv_command(["seek", seconds, "relative"])
                # State will be updated by polling
            
            elif action == "seek_absolute":
                position = params.get("position", 0)
                await send_mpv_command(["seek", position, "absolute"])
                await self.update_state({"time_pos": position})
            
            elif action == "next":
                await send_mpv_command(["playlist-next"])
                await self.update_state({"playlist_pos": self.current_state["playlist_pos"] + 1})
            
            elif action == "prev":
                await send_mpv_command(["playlist-prev"])
                await self.update_state({"playlist_pos": max(0, self.current_state["playlist_pos"] - 1)})
            
            elif action == "volume":
                level = params.get("level", 100)
                await send_mpv_command(["set_property", "volume", level])
                await self.update_state({"volume": level})
            
            elif action == "speed":
                speed = params.get("speed", 1.0)
                await send_mpv_command(["set_property", "speed", speed])
                await self.update_state({"speed": speed})
            
            elif action == "stop":
                await send_mpv_command(["stop"])
                await self.update_state({
                    "playing": False,
                    "paused": True,
                    "time_pos": 0.0
                })
            
            else:
                logger.warning(f"Unknown action: {action}")
                await sender.send_json({
                    "type": "error",
                    "message": f"Unknown action: {action}"
                })
                return
            
            # Broadcast success
            await self.broadcast({
                "type": "command_executed",
                "action": action,
                "params": params
            }, exclude=sender)
            
        except Exception as e:
            logger.error(f"Command execution failed: {e}")
            await sender.send_json({
                "type": "error",
                "message": str(e)
            })
    
    def start_polling(self):
        """Start the polling task."""
        if self._polling_task is None or self._polling_task.done():
            self._polling_task = asyncio.create_task(self.poll_mpv_state())
            logger.info("Started MPV state polling")

    def stop_polling(self):
        """Stop the polling task."""
        if self._polling_task and not self._polling_task.done():
            self._polling_task.cancel()
            self._polling_task = None
            logger.info("Stopped MPV state polling")

    async def poll_mpv_state(self):
        """
        Periodically poll MPV for state updates.
        Only runs when there are active connections.
        """
        from .mpv_control import get_mpv_property
        
        try:
            while len(self.active_connections) > 0:
                # Poll properties
                filename = await get_mpv_property("filename")
                paused = await get_mpv_property("pause")
                time_pos = await get_mpv_property("time-pos")
                duration = await get_mpv_property("duration")
                volume = await get_mpv_property("volume")
                speed = await get_mpv_property("speed")
                idle = await get_mpv_property("idle-active")
                eof = await get_mpv_property("eof-reached")
                
                updates = {}
                
                if filename is not None: updates["filename"] = filename
                if paused is not None: updates["paused"] = paused
                if time_pos is not None: updates["time_pos"] = time_pos
                if duration is not None: updates["duration"] = duration
                if volume is not None: updates["volume"] = volume
                if speed is not None: updates["speed"] = speed
                
                # Logic for status
                # If idle=True, we can consider it 'stopped' or 'finished'
                # If eof=True, also finished
                
                updates["idle"] = idle if idle is not None else False
                updates["eof"] = eof if eof is not None else False
                
                # Derive 'playing'
                updates["playing"] = (not updates.get("paused", True)) and (not updates.get("idle", False))

                if updates:
                    await self.update_state(updates)
                
                await asyncio.sleep(0.5)  # Poll every 0.5s
                
        except asyncio.CancelledError:
            logger.info("Polling task cancelled")
        except Exception as e:
            logger.error(f"State polling error: {e}")
            await asyncio.sleep(1)


# Global hub instance
mpv_hub = MPVControlHub()

