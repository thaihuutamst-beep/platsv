const os = require('os');
const path = require('path');
const fs = require('fs');

class EnvironmentV2 {
    constructor() {
        this.platform = os.platform();
        this.isTermux = process.env.PREFIX && process.env.PREFIX.includes('com.termux');
        this.isWSL = !!process.env.WSL_DISTRO_NAME;
        this.homeDir = os.homedir();

        // Port mặc định 3002 để tránh xung đột với các service cũ
        this.port = process.env.PORT || 3002;

        // Database nằm trong thư mục data gốc
        this.dbPath = path.resolve(__dirname, '../../../data/database.db');

        this.defaultScanPaths = this.detectScanPaths();
    }

    detectScanPaths() {
        // Mặc định quét thư mục library của dự án
        const projectLibrary = path.resolve(__dirname, '../../../library');

        // Tạo thư mục nếu chưa tồn tại
        if (!fs.existsSync(projectLibrary)) {
            fs.mkdirSync(projectLibrary, { recursive: true });
        }

        return [projectLibrary];
    }
}
module.exports = new EnvironmentV2();
