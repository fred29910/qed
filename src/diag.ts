/**
 * Diagnostic logger for boot tracing.
 *
 * Perry AOT 编译把 stdout 经常截断或缓冲,这里用 `process.stderr.write`
 * 直写到 stderr(无缓冲)+ fs.appendFileSync 兜底写文件,确保崩溃前
 * 的所有日志一定能被宿主看到。
 *
 * 用法:在 main.ts 的每个关键节点调 `diag(step)` 或 `diagErr(step, err)`。
 */
import { appendFileSync } from 'fs';

const LOG_PATH = '/tmp/qed-boot.log';

let stepCount = 0;

function emit(line: string): void {
    const msg = `[qed-boot ${String(stepCount).padStart(3, '0')}] ${line}\n`;
    try {
        process.stderr.write(msg);
    } catch {
        // 忽略
    }
    try {
        appendFileSync(LOG_PATH, msg);
    } catch {
        // 忽略
    }
}

export function diag(step: string, extra?: unknown): void {
    stepCount += 1;
    let line = step;
    if (extra !== undefined) {
        try {
            line += ` :: ${JSON.stringify(extra)}`;
        } catch {
            line += ' :: <unserialisable>';
        }
    }
    emit(line);
}

export function diagErr(step: string, err: unknown): void {
    stepCount += 1;
    let msg = '';
    if (err instanceof Error) {
        msg = `${err.name}: ${err.message}`;
        if (err.stack !== undefined) {
            msg += `\n${err.stack.split('\n').slice(0, 8).join('\n')}`;
        }
    } else {
        msg = String(err);
    }
    emit(`!! ${step} :: ${msg}`);
}