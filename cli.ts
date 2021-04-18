import { bold, dim } from 'https://deno.land/std@0.93.0/fmt/colors.ts'
import { existsSync } from 'https://deno.land/std@0.93.0/fs/exists.ts'
import { basename, dirname, join } from 'https://deno.land/std@0.93.0/path/mod.ts'

type Version = {
  raw: string
  major: number
  minor: number
  patch: number
  stage?: {
    name: string
    index: number
    withoutDot: boolean
  }
  startsWithV: boolean
  file: string
}

type Script = {
  prepublish?(version: string): Promise<false | void>
  postpublish?(version: string): Promise<void>
}

async function publish(currentVersion: Version, script: Script, retry = false) {
  const { raw, major, minor, patch, startsWithV, stage, file } = currentVersion
  const versions = [
    `${major}.${minor}.${patch + 1}`,
    `${major}.${minor + 1}.0`,
    `${major + 1}.0.0`,
  ]

  if (stage?.name === 'rc') {
    versions.unshift(`${major}.${minor}.${patch}-${stage.name}${stage.withoutDot ? '' : '.'}${stage.index + 1}`)
  } else if (stage?.name === 'beta') {
    versions.unshift(
      `${major}.${minor}.${patch}-${stage.name}${stage.withoutDot ? '' : '.'}${stage.index + 1}`,
      `${major}.${minor}.${patch}-rc.1`,
    )
  } else if (stage?.name === 'alpha') {
    versions.unshift(
      `${major}.${minor}.${patch}-${stage.name}${stage.withoutDot ? '' : '.'}${stage.index + 1}`,
      `${major}.${minor}.${patch}-beta.1`,
      `${major}.${minor}.${patch}-rc.1`,
    )
  } else {
    versions.push(
      `${major}.${minor}.${patch}-alpha.1`,
      `${major}.${minor}.${patch}-beta.1`,
      `${major}.${minor}.${patch}-rc.1`,
    )
  }
  const answer = await ask([
    !retry && ['', ...versions.map((v, i) => `  ${bold((i + 1).toString())} ${dim('→')} ${currentVersion.startsWithV ? 'v' : ''}${v}`), ''],
    'upgrade to:'
  ].filter(Boolean).flat().join('\n'))
  const n = parseInt(answer)
  if (!isNaN(n) && n > 0 && n <= versions.length) {
    const nextVersion = versions[n - 1]
    const message = await ask('upgrade message:')
    const { prepublish, postpublish } = script
    if (prepublish && await prepublish(nextVersion) === false) {
      return
    }
    if (existsSync(file)) {
      const text = await Deno.readTextFile(file)
      await Deno.writeTextFile(file, text.replace(raw, `${startsWithV ? 'v' : ''}${nextVersion}`))
    } else {
      if (await confirm(`create '${basename(file)}'?`)) {
        await Deno.writeTextFile(file, `export const VERSION = "${nextVersion}"`)
      } else {
        return
      }
    }
    if (!existsSync(join(dirname(file), '.git'))) {
      if (await confirm(`git: initialize repository?`)) {
        await run('git', 'init')
      } else {
        return
      }
    }
    const tagStartsWithV = await confirm(`should the tag start with 'v'?`)
    const tag = `${tagStartsWithV ? 'v' : ''}${nextVersion}`
    await run('git', 'add', '.', '--all')
    await run('git', 'commit', '-m', message || tag)
    await run('git', 'tag', tag)
    const currentRemote = (await runAndOutput('git', 'remote')).split('\n')[0]
    const currentBranch = await runAndOutput('git', 'branch', '--show-current')
    if (await confirm(`push '${currentRemote}' on '${currentBranch}' branch to remote repository?`)) {
      await run('git', 'push', currentRemote, currentBranch, '--tag', tag)
    }
    if (postpublish) {
      await postpublish(nextVersion)
    }
  } else {
    await publish(currentVersion, script, true)
  }
}

async function ask(question: string = ':', stdin = Deno.stdin, stdout = Deno.stdout) {
  await stdout.write(new TextEncoder().encode(question + ' '))
  const buf = new Uint8Array(1024)
  const n = <number>await stdin.read(buf)
  const answer = new TextDecoder().decode(buf.subarray(0, n))
  return answer.trim()
}

async function confirm(question: string = 'are you sure?') {
  let a: string
  while (!/^(y|n)$/i.test(a = (await ask(question + dim(' [y/n]'))).trim())) { }
  return a.toLowerCase() === 'y'
}

async function run(...cmd: string[]) {
  const p = Deno.run({
    cmd,
    stdout: 'inherit',
    stderr: 'inherit'
  })
  await p.status()
  p.close()
}

async function runAndOutput(...cmd: string[]) {
  const p = Deno.run({
    cmd,
    stdout: 'piped',
    stderr: 'inherit'
  })
  const output = await p.output()
  await p.status()
  p.close()
  return (new TextDecoder).decode(output).trim()
}

if (import.meta.main) {
  const script: Script = {}
  for (const name of ['publish.ts', 'publish.js']) {
    const path = join(Deno.cwd(), name)
    if (existsSync(path)) {
      const { prepublish, postpublish } = await import('file://' + path)
      if (typeof prepublish === 'function') {
        script.prepublish = prepublish
      }
      if (typeof postpublish === 'function') {
        script.postpublish = postpublish
      }
      break
    }
  }

  for (const name of ['version.ts', 'version.js']) {
    const path = join(Deno.cwd(), name)
    if (existsSync(path)) {
      const { default: rawVersionAsDefault, VERSION: rawVERSION, version: rawVersion } = await import('file://' + path)
      const list = [rawVersionAsDefault, rawVERSION, rawVersion]
      for (let i = 0; i < list.length; i++) {
        const v = list[i]
        if (typeof v === 'string' && v.length > 0) {
          const [mainVersion, stage] = v.split('-')
          const [major, minor, patch] = mainVersion.replace(/^v/, '').split('.').map(s => parseInt(s))
          if (major >= 0 && minor >= 0 && patch >= 0) {
            const version: Version = {
              raw: v,
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
            await publish(version, script)
            Deno.exit(0)
          }
        }
      }
      console.log(`'${name}' needs to export a version string with format '[v]1.2.3[-rc.4]'`)
      Deno.exit(1)
    }
  }

  // create a new version file
  await publish(
    {
      raw: '0.0.0',
      major: 0,
      minor: 0,
      patch: 0,
      startsWithV: false,
      file: join(Deno.cwd(), './version.ts')
    },
    script
  )
  Deno.exit(0)
}
