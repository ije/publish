import { dim } from "https://deno.land/std@0.217.0/fmt/colors.ts";
import { basename, join } from "https://deno.land/std@0.217.0/path/mod.ts";

type Version = {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  startsWithV: boolean;
  stage?: {
    name: string;
    index: number;
    withoutDot: boolean;
  };
  prepublish?(version: string): Promise<false | void> | false | void;
  postpublish?(version: string): Promise<void> | void;
  filename: string;
};

function createVersionTS(version: string) {
  return [
    "/** `version` managed by https://deno.land/x/land/publish. */",
    `export const VERSION = "${version}"`,
    "",
    "/** `prepublish` will be invoked before publish, return `false` to prevent the publish. */",
    "export function prepublish(version: string) {",
    `  console.log("Upgrading to", version)`,
    "}",
    "",
    "/** `postpublish` will be invoked after published. */",
    "export function postpublish(version: string) {",
    `  console.log("Upgraded to", version)`,
    "}",
  ].join("\n");
}

async function publish(currentVersion: Version) {
  const {
    raw,
    major,
    minor,
    patch,
    startsWithV,
    stage,
    prepublish,
    postpublish,
    filename,
  } = currentVersion;
  const version = [major, minor, patch].join(".");
  const versionList = [
    `${major}.${minor}.${patch + 1}`,
    `${major}.${minor + 1}.0`,
    `${major + 1}.0.0`,
  ];
  if (stage?.name === "rc") {
    versionList.unshift(
      `${version}-${stage.name}${stage.withoutDot ? "" : "."}${stage.index + 1}`,
    );
  } else if (stage?.name === "beta") {
    versionList.unshift(
      `${version}-${stage.name}${stage.withoutDot ? "" : "."}${stage.index + 1}`,
      `${version}-rc.1`,
    );
  } else if (stage?.name === "alpha") {
    versionList.unshift(
      `${version}-${stage.name}${stage.withoutDot ? "" : "."}${stage.index + 1}`,
      `${version}-beta.1`,
      `${version}-rc.1`,
    );
  } else {
    versionList.push(
      `${version}-alpha.1`,
      `${version}-beta.1`,
      `${version}-rc.1`,
    );
  }
  print("Upgrade to:\n");
  const updateTo = await select(versionList);
  const nextVersion = versionList[updateTo];
  if (prepublish && await prepublish(nextVersion) === false) {
    return;
  }
  if (await exists(filename)) {
    const text = await Deno.readTextFile(filename);
    await Deno.writeTextFile(
      filename,
      text.replace(raw, `${startsWithV ? "v" : ""}${nextVersion}`),
    );
  } else {
    if (await confirm(`create '${basename(filename)}'?`) === false) {
      return;
    }
    await Deno.writeTextFile(filename, createVersionTS(nextVersion));
  }

  const tagStartsWithV = await confirm("should the tag start with 'v'?");
  const tag = `${tagStartsWithV ? "v" : ""}${nextVersion}`;
  await run("git", "add", ".", "--all");
  await run("git", "commit", "-m", tag);
  await run("git", "tag", tag);
  const currentRemote = (await $run("git", "remote")).trim();
  const currentBranch = (await $run("git", "branch", "--show-current")).trim();
  if (
    await confirm(`push '${currentRemote}' on '${currentBranch}' branch to remote repository?`)
  ) {
    await run("git", "push", currentRemote, currentBranch, "--tag", tag);
  }
  if (postpublish) {
    await postpublish(nextVersion);
  }
}

function print(message: string) {
  return Deno.stdout.write(new TextEncoder().encode(message));
}

const clearLine = async () => {
  const ESC = "\x1b"; // ASCII escape character
  const CSI = ESC + "["; // control sequence introducer
  await print(CSI + "A"); // moves cursor up one line
  await print(CSI + "K"); // clears from cursor to line end
};

async function ask(question = ":") {
  Deno.stdin.setRaw(false);
  await print(question + " ");
  const buf = new Uint8Array(8);
  const n = <number> await Deno.stdin.read(buf);
  if (buf[0] === 13) { // enter
    return "n";
  }
  const answer = new TextDecoder().decode(buf.subarray(0, n));
  return answer.trim();
}

async function select(list: string[]): Promise<number> {
  let selected = 0;
  Deno.stdin.setRaw(true, { cbreak: true });
  while (true) {
    for (let i = 0; i < list.length; i++) {
      if (i === selected) {
        await print(`> ${list[i]}\n`);
      } else {
        await print(dim(`  ${list[i]}\n`));
      }
    }
    const key = new Uint8Array(8);
    await Deno.stdin.read(key);
    if (key[0] === 13) { // enter
      break;
    }
    if (key[0] === 27 && key[1] === 91) { // arrow keys
      if (key[2] === 65) { // up
        selected = (selected - 1 + list.length) % list.length;
      } else if (key[2] === 66) { // down
        selected = (selected + 1) % list.length;
      }
    }
    for (let i = 0; i < list.length; i++) {
      await clearLine();
    }
  }
  Deno.stdin.setRaw(false);
  return selected;
}

async function confirm(question = "are you sure?") {
  let a: string;
  while (!/^(y|n)?$/i.test(a = await ask(dim("? ") + question + dim(" [y/N]")))) {}
  return a === "y";
}

function run(command: string, ...args: string[]): Promise<Deno.CommandStatus> {
  const cmd = new Deno.Command(command, {
    args,
    stdout: "inherit",
    stderr: "inherit",
  });
  return cmd.spawn().status;
}

async function $run(command: string, ...args: string[]): Promise<string> {
  const cmd = new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "inherit",
  });
  const process = cmd.spawn();
  const res = new Response(process.stdout);
  return await res.text();
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await Deno.lstat(filePath);
    return true;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return false;
    }
    throw err;
  }
}

if (import.meta.main) {
  if (await exists(join(Deno.cwd(), ".git")) === false) {
    console.log("Please initialize the repository and run the script again.");
    Deno.exit(1);
  }

  for (
    const name of ["version.ts", "version.mts", "version.js", "version.mjs"]
  ) {
    const path = join(Deno.cwd(), name);
    if (await exists(path)) {
      const {
        default: rawVersionAsDefault,
        VERSION: rawVERSION,
        version: rawVersion,
        prepublish,
        postpublish,
      } = await import("file://" + path);
      const list = [rawVersionAsDefault, rawVERSION, rawVersion];
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (typeof v === "string" && v.length > 0) {
          const [mainVersion, stage] = v.split("-");
          const [major, minor, patch] = mainVersion.replace(/^v/i, "").split(".").map((s) => parseInt(s));
          if (major >= 0 && minor >= 0 && patch >= 0) {
            const version: Version = {
              raw: v,
              major,
              minor,
              patch,
              startsWithV: /^v/i.test(mainVersion),
              prepublish,
              postpublish,
              filename: path,
            };
            if (/^[a-z]+\.?\d+/i.test(stage)) {
              version.stage = {
                name: stage.replace(/[\.\d]+/g, ""),
                index: parseInt(stage.replace(/[\.a-z]+/gi, "")),
                withoutDot: !/\./.test(stage),
              };
            }
            await publish(version);
            Deno.exit(0);
          }
        }
      }
      console.log(`'${name}' needs to export a version string with format '[v]1.2.3[-rc.4]'`);
      Deno.exit(1);
    }
  }

  // create a new version file
  await publish({
    raw: "0.0.0",
    major: 0,
    minor: 0,
    patch: 0,
    startsWithV: false,
    filename: join(Deno.cwd(), "./version.ts"),
  });
  Deno.exit(0);
}
