/** `postpublish` will be invoked before publish. */
export async function prepublish(version: string, message: string) {
    const readme = await Deno.readTextFile('./README.md')

    await Deno.writeTextFile('./README.md', readme.replace(
        /\/\/deno\.land\/x\/publish@v[\d\.]+\//,
        `//deno.land/x/publish@v${version}/`
    ))
}

/** `postpublish` will be invoked after publish. */
export async function postpublish() {
    console.log('Done')
}
