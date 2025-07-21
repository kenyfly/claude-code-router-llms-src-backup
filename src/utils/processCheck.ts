import { existsSync, readFileSync, writeFileSync } from 'fs';
import { PID_FILE, REFERENCE_COUNT_FILE } from '../constants';

export function incrementReferenceCount() {
    let count = 0;
    if (existsSync(REFERENCE_COUNT_FILE)) {
        count = parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8')) || 0;
    }
    count++;
    writeFileSync(REFERENCE_COUNT_FILE, count.toString());
}

export function decrementReferenceCount() {
    let count = 0;
    if (existsSync(REFERENCE_COUNT_FILE)) {
        count = parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8')) || 0;
    }
    count = Math.max(0, count - 1);
    writeFileSync(REFERENCE_COUNT_FILE, count.toString());
}

export function getReferenceCount(): number {
    if (!existsSync(REFERENCE_COUNT_FILE)) {
        return 0;
    }
    return parseInt(readFileSync(REFERENCE_COUNT_FILE, 'utf-8')) || 0;
}

export function isServiceRunning(port: number): boolean {
    const pidFile = PID_FILE(port);
    if (!existsSync(pidFile)) {
        return false;
    }

    try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8'));
        process.kill(pid, 0);
        return true;
    } catch (e) {
        // Process not running, clean up pid file
        cleanupPidFile(port);
        return false;
    }
}

export function savePid(pid: number, port: number) {
    const pidFile = PID_FILE(port);
    writeFileSync(pidFile, pid.toString());
}

export function cleanupPidFile(port: number) {
    const pidFile = PID_FILE(port);
    if (existsSync(pidFile)) {
        try {
            const fs = require('fs');
            fs.unlinkSync(pidFile);
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

export function getServicePid(port: number): number | null {
    const pidFile = PID_FILE(port);
    if (!existsSync(pidFile)) {
        return null;
    }
    
    try {
        const pid = parseInt(readFileSync(pidFile, 'utf-8'));
        return isNaN(pid) ? null : pid;
    } catch (e) {
        return null;
    }
}

export async function getServiceInfo(port: number) {
    const pid = getServicePid(port);
    const running = isServiceRunning(port);
    
    return {
        running,
        pid,
        port: port,
        endpoint: `http://127.0.0.1:${port}`,
        pidFile: PID_FILE(port),
        referenceCount: getReferenceCount()
    };
}
