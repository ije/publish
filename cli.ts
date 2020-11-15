import { bold, dim } from 'https://deno.land/std@0.74.0/fmt/colors.ts'
import { existsSync } from 'https://deno.land/std@0.74.0/fs/exists.ts'
import { basename, dirname, join } from 'https://deno.land/std@0.74.0/path/mod.ts'

interface Verion {
    major: number
    minor: number
    patch: number
    startsWithV: boolean
    stage?: {
        name: string
        index: number
        withoutDot: boolean
    }
    file: string
}

async function publish(current: Verion, raw: string) {
    const { major, minor, patch, startsWithV, stage, file } = current
    const versions = [
        `${major}.${minor}.${patch + 1}`,
        `${major}.${minor + 1}.0`,
        `${major + 1}.0.0`,
    ]
    if (stage) {
        versions.unshift(`${major}.${minor}.${patch}-${stage.name}${stage.withoutDot ? '' : '.'}${stage.index + 1}`)
    } else {
        versions.push(
            `${major}.${minor}.${patch}-alpha.1`,
            `${major}.${minor}.${patch}-beta.1`,
            `${major}.${minor}.${patch}-rc.1`,
        )
    }
    const answer = await ask('\n' + [...versions.map((v, i) => `  ${bold((i + 1).toString())} ${dim('→')} v${v}`), '\nupgrade to:'].join('\n'))
    const n = parseInt(answer)
    if (!isNaN(n) && n > 0 && n <= versions.length) {
        let up = versions[n - 1]
        const message = await ask('message:')
        if (existsSync(file)) {
            const text = await Deno.readTextFile(file)
            await Deno.writeTextFile(file, text.replace(raw, `${startsWithV ? 'v' : ''}${up}`))
        } else {
            if (await confirm(`create '${basename(file)}' ?`)) {
                await Deno.writeTextFile(file, `export const version = "${up}"`)
            } else {
                return
            }
        }
        const eggFile = join(dirname(file), 'egg.json')
        if (existsSync(eggFile)) {
            const text = await Deno.readTextFile(eggFile)
            const eggConfig = JSON.parse(text)
            if (typeof eggConfig === 'object' && eggConfig != null && 'version' in eggConfig) {
                await Deno.writeTextFile(eggFile, text.replace(/"version":(\s*)"[^"]+"/, `"version":$1"${up}"`))
            }
        }
        if (!existsSync(join(dirname(file), '.git'))) {
            if (await confirm(`initialize repository ?`)) {
                await run('git', 'init')
            } else {
                return
            }
        }
        await run('git', 'add', '.', '--all')
        await run('git', 'commit', '-m', message || `v${up}`)
        await run('git', 'tag', `v${up}`)
        if (await confirm(`push to remote repository ?`)) {
            await run('git', 'push', 'origin', 'master', '--tag', `v${up}`)
        }
        if (existsSync(eggFile) && await confirm(`push to nest.land ?`)) {
            await run('eggs', 'publish')
        }
    }
}

async function ask(question: string = ':', stdin = Deno.stdin, stdout = Deno.stdout) {
    await stdout.write(new TextEncoder().encode(question + ' '))
    const buf = new Uint8Array(1024)
    const n = <number>await stdin.read(buf)
    const answer = new TextDecoder().decode(buf.subarray(0, n))
    return answer.trim()
}

async function confirm(question: string = 'are you sure ?') {
    let a: string
    while (!/^(y|n)$/i.test(a = (await ask(question + ' [y/n]')).trim())) { }
    return a.toLowerCase() === 'y'
}

async function run(...cmd: string[]) {
    const p = Deno.run({
        cmd,
        stdout: 'piped',
        stderr: 'piped'
    })
    Deno.stdout.write(await p.output())
    Deno.stderr.write(await p.stderrOutput())
    p.close()
}

if (import.meta.main) {
    const versionFiles = ['version.ts', 'version.js', 'version.mjs']
    for (const name of versionFiles) {
        const path = join(Deno.cwd(), name)
        if (existsSync(path)) {
            let { default: versionAsDefault, version: versonString } = await import('file://' + path)
            if (typeof versonString !== 'string') {
                versonString = versionAsDefault
            }
            if (typeof versonString === 'string' && versonString.length > 0) {
                const [mainVersion, stage] = versonString.split('-')
                const [major, minor, patch] = mainVersion.replace(/^v/, '').split('.').map(s => parseInt(s))
                if (major >= 0 && minor >= 0 && patch >= 0) {
                    const version: Verion = {
                        major,
                        minor,
                        patch,
                        startsWithV: mainVersion.charAt(0).toLowerCase() === 'v',
                        file: path
                    }
                    if (/^[a-z]+\.?\d+/.test(stage)) {
                        version.stage = {
                            name: stage.replace(/[\.\d]+/g, ''),
                            index: parseInt(stage.replace(/[\.a-z]+/gi, '')),
                            withoutDot: !/\./.test(stage)
                        }
                    }
                    await publish(version, versonString)
                    Deno.exit(0)
                }
            }
            console.log(`'${name}' needs to export a version string with format '[v]1.2.3[-rc.4]'`)
            Deno.exit(1)
        }
    }

    // create a new version file
    await publish(
        {
            major: 0,
            minor: 0,
            patch: 0,
            startsWithV: false,
            file: join(Deno.cwd(), './version.ts')
        },
        '0.0.0'
    )
    Deno.exit(0)
}
