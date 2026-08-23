/*
 * 파일 선택창을 띄워 사용자가 고른 파일을 public/clips/<주제slug>/ 로 복사한다.
 *
 * 왜 필요한가: 그전까지는 "탐색기에서 파일 우클릭 → 경로로 복사 → 채팅에 붙여넣기"였다.
 * 비개발자에게 이건 그 자체로 벽이다 — 실제 테스터가 "하나하나 찾으면서 넣는 게 너무
 * 번거롭다"고 반려했다(2026-08-23). 운영체제가 파일 고르는 창을 이미 갖고 있으니 그걸 쓴다.
 *
 *   node scripts/pick-files.mjs <주제slug>
 *
 * 고른 파일의 **복사된 상대경로**를 한 줄씩 찍는다(덱의 clip에 그대로 넣는 값).
 * 취소하면 CANCELLED, 지원 안 하는 환경이면 UNSUPPORTED 를 찍고 정상 종료한다 —
 * 스킬은 그때 예전 방식(경로 붙여넣기)으로 물러선다.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename, extname, resolve, sep } from 'node:path';
import { tmpdir, platform } from 'node:os';

const slug = process.argv[2];
if (!slug || !/^[\w가-힣.-]+$/u.test(slug)) {
  console.error('사용법: node scripts/pick-files.mjs <주제slug>');
  process.exit(1);
}

const EXTS = ['.mp4', '.png', '.jpg', '.jpeg', '.webp'];

/* 파일 선택창은 운영체제가 띄운다. Windows는 PowerShell + WinForms,
   Mac은 osascript. 둘 다 아니면 UNSUPPORTED. */
function pick() {
  if (platform() === 'win32') {
    /* ⚠ 스크립트를 BOM 없는 UTF-8로 쓰면 PowerShell이 한글을 깨뜨려 파싱 에러를 낸다
       (실측: "'?��진' 토큰" 에러). utf-8 BOM으로 저장해야 한다. */
    const ps = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$f = New-Object System.Windows.Forms.OpenFileDialog',
      '$f.Title = "카드뉴스에 쓸 사진이나 화면 녹화를 골라주세요 (여러 개 선택 가능)"',
      `$f.Filter = "사진.영상|${EXTS.map((e) => '*' + e).join(';')}|모든 파일|*.*"`,
      '$f.Multiselect = $true',
      '$f.InitialDirectory = [Environment]::GetFolderPath("MyPictures")',
      'if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.FileNames -join "`n" } else { "CANCELLED" }',
    ].join('\n');
    const tmp = join(tmpdir(), `haru-pick-${process.pid}.ps1`);
    writeFileSync(tmp, '﻿' + ps, 'utf8');
    const r = spawnSync('powershell', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', tmp], { encoding: 'utf8' });
    rmSync(tmp, { force: true });
    return r.stdout ?? '';
  }
  if (platform() === 'darwin') {
    const types = EXTS.map((e) => `"${e.slice(1)}"`).join(', ');
    const r = spawnSync('osascript', ['-e',
      `set fs to choose file with prompt "카드뉴스에 쓸 사진이나 화면 녹화를 골라주세요" of type {${types}} with multiple selections allowed
       set out to ""
       repeat with f in fs
         set out to out & POSIX path of f & linefeed
       end repeat
       return out`], { encoding: 'utf8' });
    return r.status === 0 ? (r.stdout ?? '') : 'CANCELLED';
  }
  return 'UNSUPPORTED';
}

const raw = pick().trim();
if (!raw || raw === 'CANCELLED') { console.log('CANCELLED'); process.exit(0); }
if (raw === 'UNSUPPORTED') { console.log('UNSUPPORTED'); process.exit(0); }

const dir = join('public', 'clips', slug);
mkdirSync(dir, { recursive: true });
const PUBLIC_DIR = resolve('public');

let n = 0;
for (const line of raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
  if (!existsSync(line)) { console.error(`  건너뜀(파일 없음): ${line}`); continue; }
  const ext = extname(line).toLowerCase();
  if (!EXTS.includes(ext)) { console.error(`  건너뜀(지원 안 하는 형식 ${ext}): ${basename(line)}`); continue; }
  /* 복사 대상도 public 안에 가둔다 — 파일명에 이상한 게 섞여도 밖으로 못 나가게(§safeClipPath와 같은 이유) */
  const dest = resolve(dir, basename(line).replace(/[\\/:*?"<>|]/g, '_'));
  if (dest !== PUBLIC_DIR && !dest.startsWith(PUBLIC_DIR + sep)) { console.error(`  건너뜀(경로 이상): ${line}`); continue; }
  copyFileSync(line, dest);
  console.log(`clips/${slug}/${basename(dest)}`);
  n++;
}
if (n === 0) console.log('CANCELLED');
