# Publish

Create git tag(version) and push to remote without any hassle.

### Installation

```bash
deno install --allow-read --allow-write --allow-run -f -n publish https://deno.land/x/publish@v1.15.0/cli.ts
```

or use [land](https://deno.land/x/land) without installation:

```
land publish
```

### Usage

```bash
$ cd $YOUR_PROJECT_DIR
$ publish

  1 → v1.0.1
  2 → v1.1.0
  3 → v2.0.0
  4 → v1.0.0-alpha.1
  5 → v1.0.0-beta.1
  6 → v1.0.0-rc.1

upgrade to: ▏
```

**Publish** will create a `version.ts` file in your project root directory if it doesn't exist.

```ts
export const VERSION = '1.0.0'
```

### Hook Functions

You can add hook functions in the `version.ts` to do some tasks before or after publish.

```ts
/** `prepublish` will be invoked before publish, return `false` to prevent the publish. */
export function prepublish(version: string) {
  console.log('on prepublish', version)
}

/** `postpublish` will be invoked after published. */
export function postpublish(version: string) {
  console.log('on postpublish', version)
}
```
