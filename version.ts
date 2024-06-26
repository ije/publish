/** `version` managed by https://deno.land/x/land/publish. */
export const VERSION = "1.16.1";

/** `prepublish` will be invoked before publish, return `false` to prevent the publish. */
export async function prepublish(version: string) {
  const readme = await Deno.readTextFile("./README.md");

  await Deno.writeTextFile(
    "./README.md",
    readme.replace(
      /\/\/deno\.land\/x\/publish@v[\d\.]+\//,
      `//deno.land/x/publish@v${version}/`,
    ),
  );
}

/** `postpublish` will be invoked after published. */
export function postpublish(version: string) {
  console.log("Upgraded to", version);
}
