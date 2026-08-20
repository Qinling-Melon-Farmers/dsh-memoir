import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function promoteSubheadings(lines) {
  return lines
    .map((line) => line.replace(/^#### /, '### '))
    .join('\n')
    .trim()
}

export function renderReleaseNotes(changelog, version) {
  if (!version || version === 'Unreleased') {
    throw new Error('A released semantic version is required')
  }

  const lines = changelog.replace(/\r\n/g, '\n').split('\n')
  const versionHeading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s+-.*)?$`)
  const start = lines.findIndex((line) => versionHeading.test(line))
  if (start < 0) {
    throw new Error(`Version ${version} was not found in CHANGELOG.md`)
  }

  const nextVersionOffset = lines
    .slice(start + 1)
    .findIndex((line) => /^## \[/.test(line))
  const end = nextVersionOffset < 0 ? lines.length : start + 1 + nextVersionOffset
  const section = lines.slice(start + 1, end)
  const chineseHeading = section.indexOf('### 中文')
  const englishHeading = section.indexOf('### English')

  if (chineseHeading < 0 || englishHeading < 0 || englishHeading <= chineseHeading) {
    throw new Error(`Version ${version} must contain Chinese followed by English notes`)
  }

  const chinese = promoteSubheadings(section.slice(chineseHeading + 1, englishHeading))
  const english = promoteSubheadings(section.slice(englishHeading + 1))
  if (!chinese || !english) {
    throw new Error(`Version ${version} contains an empty language section`)
  }

  return [
    '## 中文',
    '',
    chinese,
    '',
    '<details>',
    '<summary>English</summary>',
    '',
    '## English',
    '',
    english,
    '',
    '</details>',
    '',
    '---',
    '',
    `- [完整更新日志 / Full changelog](https://github.com/Qinling-Melon-Farmers/dsh-memoir/blob/v${version}/CHANGELOG.md)`,
    `- [npm package](https://www.npmjs.com/package/dsh-memoir/v/${version})`,
    '',
  ].join('\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const changelog = readFileSync(resolve(repositoryRoot, 'CHANGELOG.md'), 'utf8')
    process.stdout.write(renderReleaseNotes(changelog, process.argv[2]))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
