# Publish

**Publish** your packge with one command.

### Installation
```bash
deno install -A -f -n publish https://deno.land/x/publish/cli.ts
```

### Usage

```bash
$ cd $YOUR_PACKAGE_DIR
$ publish

  1 → v0.1.1
  2 → v0.2.0
  3 → v1.0.0
  4 → v0.1.0-alpha.1
  5 → v0.1.0-beta.1
  6 → v0.1.0-rc.1

upgrade to:
```

**Publish** will create a `version.ts` file in your package if it don't exists.

```javascript
export const version = '1.0.0'
```