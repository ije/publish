# Publish

**Publish** your module with one command in [Deno](https://deno.land).

### Installation

```bash
deno install -A -f -n publish https://deno.land/x/publish@v1.5.0/cli.ts
```

### Usage

```bash
$ cd $YOUR_MODULE_DIR
$ publish

  1 → v1.0.1
  2 → v1.1.0
  3 → v2.0.0
  4 → v1.0.0-alpha.1
  5 → v1.0.0-beta.1
  6 → v1.0.0-rc.1

upgrade to: ▏
```

**Publish** will create a `version.ts` file in your module root directory if it doesn't exist.

```ts
export const VERSION = '1.0.0'
```

### Custom Script

You can add a custom script (support `publish.ts` or `publish.js` in your module root directory) to do somehting before or after publish:

```ts
// publish.ts

/* `prepublish` will be invoked before publish */
export async function prepublish(version: string, message: string) {
    console.log('on prepublish', version, message)
}

/* `postpublish` will be invoked after publish */
export async function postpublish() {
    console.log('on postpublish')
}
```
