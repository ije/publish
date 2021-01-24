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

**Publish** will create a `version.ts` file in your module root directory if it dones't exist.

```javascript
export const version = '1.0.0'
```
