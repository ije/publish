import { bold, dim } from "https://deno.land/std@0.145.0/fmt/colors.ts";
import {
  basename,
  dirname,
  join,
} from "https://deno.land/std@0.145.0/path/mod.ts";

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
  prepublish?(version: string): Promise<false | void>;
  postpublish?(version: string): Promise<void>;
  file: string;
};

function createBlankVersionTS(version: string) {
  return [
    "/** `version` managed by https://deno.land/x/land/publish. */",
    `export const VERSION = "${version}"`,
    "",
    "/** `prepublish` will be invoked before publish, return `false` to prevent the publish. */",
    "export async function prepublish(version: string) {",
    `  console.log("Upgrading to", version)`,
    "}",
    "",
    "/** `postpublish` will be invoked after published. */",
    "export async function postpublish(version: string) {",
    `  console.log("Upgraded to", version)`,
    "}",
  ].join("\n");
}

async function publish(currentVersion: Version, retry = false) {
  const {
    raw,
    major,
    minor,
    patch,
    startsWithV,
    stage,
    prepublish,
    postpublish,
    file,
  } = currentVersion;
  const version = [major, minor, patch].join(".");
  const nextVersions = [
    `${major}.${minor}.${patch + 1}`,
    `${major}.${minor + 1}.0`,
    `${major + 1}.0.0`,
  ];
  if (stage?.name === "rc") {
    nextVersions.unshift(
      `${version}-${stage.name}${stage.withoutDot ? "" : "."}${
        stage.index + 1
      }`,
    );
  } else if (stage?.name === "beta") {
    nextVersions.unshift(
      `${version}-${stage.name}${stage.withoutDot ? "" : "."}${
        stage.index + 1
      }`,
      `${version}-rc.1`,
    );
  } else if (stage?.name === "alpha") {
    nextVersions.unshift(
      `${version}-${stage.name}${stage.withoutDot ? "" : "."}${
        stage.index + 1
      }`,
      `${version}-beta.1`,
      `${version}-rc.1`,
    );
  } else {
    nextVersions.push(
      `${version}-alpha.1`,
      `${version}-beta.1`,
      `${version}-rc.1`,
    );
  }
  const answer = await ask(
    [
      !retry && [
        "",
        ...nextVersions.map((v, i) =>
          `  ${bold((i + 1).toString())} ${dim("→")} ${
            currentVersion.startsWithV ? "v" : ""
          }${v}`
        ),
        "",
      ],
      "upgrade to:",
    ].filter(Boolean).flat().join("\n"),
  );
  const n = parseInt(answer);
  if (!isNaN(n) && n > 0 && n <= nextVersions.length) {
    const nextVersion = nextVersions[n - 1];
    if (prepublish && await prepublish(nextVersion) === false) {
      return;
    }
    if (await exists(file)) {
      const text = await Deno.readTextFile(file);
      await Deno.writeTextFile(
        file,
        text.replace(raw, `${startsWithV ? "v" : ""}${nextVersion}`),
      );
    } else {
      if (await confirm(`create '${basename(file)}'?`) === false) {
        return;
      }
      await Deno.writeTextFile(file, createBlankVersionTS(nextVersion));
    }
    if (await exists(join(dirname(file), ".git")) === false) {
      if (await confirm("git: initialize repository?") === false) {
        return;
      }
      await run("git", "init");
    }
    const tagStartsWithV = await confirm("should the tag start with 'v'?");
    const tag = `${tagStartsWithV ? "v" : ""}${nextVersion}`;
    await run("git", "add", ".", "--all");
    await run("git", "commit", "-m", tag);
    await run("git", "tag", tag);
    const currentRemote = (await runAndOutput("git", "remote")).split("\n")[0];
    const currentBranch = await runAndOutput("git", "branch", "--show-current");
    if (
      await confirm(
        `push '${currentRemote}' on '${currentBranch}' branch to remote repository?`,
      )
    ) {
      await run("git", "push", currentRemote, currentBranch, "--tag", tag);
    }
    if (postpublish) {
      await postpublish(nextVersion);
    }
  } else {
    await publish(currentVersion, true);
  }
}

async function ask(question = ":", stdin = Deno.stdin, stdout = Deno.stdout) {
  await stdout.write(new TextEncoder().encode(question + " "));
  const buf = new Uint8Array(1024);
  const n = <number> await stdin.read(buf);
  const answer = new TextDecoder().decode(buf.subarray(0, n));
  return answer.trim();
}

async function confirm(question = "are you sure?") {
  let a: string;
  // deno-lint-ignore no-empty
  while (!/^(y|n)$/i.test(a = (await ask(question + dim(" [y/n]"))).trim())) {}
  return a.toLowerCase() === "y";
}

async function run(...cmd: string[]): Promise<void> {
  const p = Deno.run({
    cmd,
    stdout: "inherit",
    stderr: "inherit",
  });
  await p.status();
  p.close();
}

async function runAndOutput(...cmd: string[]): Promise<string> {
  const p = Deno.run({
    cmd,
    stdout: "piped",
    stderr: "inherit",
  });
  const output = await p.output();
  await p.status();
  p.close();
  return (new TextDecoder()).decode(output).trim();
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
  for (const name of ["version.ts", "version.js"]) {
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
          const [major, minor, patch] = mainVersion.replace(/^v/, "").split(".")
            .map((s) => parseInt(s));
          if (major >= 0 && minor >= 0 && patch >= 0) {
            const version: Version = {
              raw: v,
              major,
              minor,
              patch,
              startsWithV: mainVersion.charAt(0).toLowerCase() === "v",
              prepublish,
              postpublish,
              file: path,
            };
            if (/^[a-z]+\.?\d+/.test(stage)) {
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
      console.log(
        `'${name}' needs to export a version string with format '[v]1.2.3[-rc.4]'`,
      );
      Deno.exit(1);
    }
  }

  // create a new version file
  await publish(
    {
      raw: "0.0.0",
      major: 0,
      minor: 0,
      patch: 0,
      startsWithV: false,
      file: join(Deno.cwd(), "./version.ts"),
    },
  );
  Deno.exit(0);
}
