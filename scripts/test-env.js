const os = require('os');
const path = require('path');
const fs = require('fs');

console.log("\n🔍 --- DRAM DIAGNOSTIC ---");
const platform = os.platform();
const isTermux = process.env.PREFIX && process.env.PREFIX.includes('com.termux');
const userHome = os.homedir();

console.log(`✅ Platform: ${platform} | Termux: ${isTermux}`);
console.log(`✅ Home Dir: ${userHome}`);
console.log("\n-------------------------------------\n");
