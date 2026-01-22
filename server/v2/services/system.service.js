const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class SystemService {
    async getDrives() {
        const platform = os.platform();
        if (platform === 'win32') {
            try {
                // Use wmic to get logical disks
                const { stdout } = await execAsync('wmic logicaldisk get name');
                const drives = stdout.split('\r\r\n')
                    .filter(line => /[A-Za-z]:/.test(line))
                    .map(line => line.trim())
                    .map(drive => ({
                        name: drive,
                        path: drive + '/',
                        type: 'drive'
                    }));
                return drives;
            } catch (e) {
                // Fallback to C: and D:
                return [
                    { name: 'C:', path: 'C:/', type: 'drive' },
                    { name: 'D:', path: 'D:/', type: 'drive' }
                ];
            }
        } else {
            return [{ name: 'Root', path: '/', type: 'drive' }];
        }
    }

    async getDirectoryContents(dirPath) {
        try {
            // Normalize path
            dirPath = path.normalize(dirPath);
            if (!dirPath.endsWith(path.sep)) dirPath += path.sep;

            const items = await fs.readdir(dirPath, { withFileTypes: true });

            const directories = items
                .filter(item => item.isDirectory())
                .map(item => ({
                    name: item.name,
                    path: path.join(dirPath, item.name),
                    type: 'directory'
                }));

            return {
                current: dirPath,
                parent: path.dirname(dirPath),
                items: directories
            };
        } catch (e) {
            throw new Error(`Cannot read directory: ${e.message}`);
        }
    }
}

module.exports = new SystemService();
