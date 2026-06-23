/**
 * electron-wait.js
 * Vite 개발 서버(포트 5173)가 완전히 준비된 후 Electron을 시작합니다.
 * 기존 Electron 프로세스를 자동으로 정리하여 SingleInstanceLock 충돌을 방지합니다.
 */

import { spawn, execSync } from 'child_process';
import http from 'http';

const VITE_PORT = 5173;
const MAX_RETRIES = 40;
const RETRY_INTERVAL_MS = 800;

// 기존 Electron 프로세스 모두 종료 (SingleInstanceLock 충돌 방지)
function killExistingElectron() {
    try {
        if (process.platform === 'win32') {
            execSync('taskkill /F /IM electron.exe /T 2>nul', { stdio: 'ignore' });
        } else {
            execSync('pkill -f electron 2>/dev/null || true', { stdio: 'ignore' });
        }
        console.log('[electron-wait] 기존 Electron 프로세스 정리 완료');
    } catch (e) {
        // 프로세스가 없으면 정상 - 무시
    }
}

function checkViteReady(retries = 0) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${VITE_PORT}`, (res) => {
            resolve(true);
        });

        req.on('error', () => {
            if (retries >= MAX_RETRIES) {
                reject(new Error(`Vite 서버가 ${MAX_RETRIES}초 내에 시작되지 않았습니다.`));
            } else {
                if (retries % 5 === 0) {
                    console.log(`[electron-wait] Vite 대기 중... (${retries + 1}/${MAX_RETRIES})`);
                }
                setTimeout(() => {
                    checkViteReady(retries + 1).then(resolve).catch(reject);
                }, RETRY_INTERVAL_MS);
            }
        });

        req.setTimeout(600, () => {
            req.destroy();
        });
    });
}

async function main() {
    // 먼저 기존 Electron 프로세스 정리
    killExistingElectron();

    // 잠깐 대기 (프로세스 종료 완료 후)
    await new Promise(r => setTimeout(r, 800));

    console.log('[electron-wait] Vite 개발 서버 준비를 기다립니다...');

    try {
        await checkViteReady();
        console.log('[electron-wait] Vite 준비 완료! Electron을 시작합니다.');

        // Windows에서는 shell: true 가 필수 (.cmd, .bat 파일 실행에 필요)
        const electronProcess = spawn('npx', ['electron', '.'], {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
        });

        electronProcess.on('close', (code) => {
            console.log(`[electron-wait] Electron이 종료되었습니다 (코드: ${code})`);
            process.exit(code || 0);
        });

        electronProcess.on('error', (err) => {
            console.error('[electron-wait] Electron 실행 오류:', err.message);
            process.exit(1);
        });

    } catch (err) {
        console.error('[electron-wait] 오류:', err.message);
        process.exit(1);
    }
}

main();
