# Pedido al dev del compile VPS — verificación de fuente Move

Contexto: estamos agregando "verificar código fuente" al explorador. La app va a
mandar el `Move.toml` **on-chain** (no el que sube el usuario) más los `sources/`
y, si hacen falta, las deps locales; el VPS compila y la app compara el bytecode
contra el de la chain.

Necesitamos estos cambios en `move-compile.hoglet.xyz`. Nada de esto debería
cambiar el comportamiento del compile normal del IDE.

## 1. Devolver la versión del compilador

En la respuesta de `POST /compile` (y `/test` si aplica), agregar:

```json
{
  "compiler_version": "supra-move-tool x.y.z",
  "framework_commit": "<sha si lo conocés, o null>"
}
```

Sin eso no podemos explicar un mismatch (¿fuente distinta o toolchain distinto?).

## 2. Aceptar un árbol `deps/` y un manifiesto con `local`

El request puede traer un file map así:

```
Move.toml
sources/amm.move
deps/RazorLibs/Move.toml
deps/RazorLibs/sources/*.move
```

y el `Move.toml` raíz puede tener:

```toml
[dependencies.RazorLibs]
local = "deps/RazorLibs"
```

Necesitamos que el servicio escriba el file map **tal cual** bajo la raíz del
package y que el compilador resuelva ese `local`. Que no filtre ni reescriba
`deps/`; los chequeos de seguridad (absolutas, `..`, symlinks) los seguimos
haciendo igual.

## 3. Una lane aparte para verificación

Una verificación puede tardar los 300 s. Si comparte la cola con el IDE, bloquea
el workspace. Opciones:

- un campo `"purpose": "verify"` en el body, o
- un header, o
- una segunda instancia/cola.

Lo importante: que un verify no deje esperando a un compile normal. Si no hay
segunda lane, preferimos que el verify devuelva 503 y reintentemos antes que
encolarse delante del IDE.

## 4. `GET /version`

Que devuelva la versión exacta del toolchain y, si se puede, el commit del
framework que tiene cacheado. Lo usamos para el badge y para el registro.

## 5. Git: solo `https://github.com/`

El manifiesto on-chain puede tener deps `git` con `rev` de rama. La app va a
validar el host, pero queremos que el servicio también rechace:

- cualquier protocolo que no sea `https`,
- hosts que no sean `github.com`,
- IPs privadas / link-local / loopback.

Y que registre en la respuesta qué repo/rev usó, si es barato.

## 6. Nada más

El servicio **no** necesita hablar con la chain ni comparar nada: sigue
devolviendo `address::name` + hex por módulo, como ahora. La comparación y el
storage son del lado de la app.

Si algo de esto no es viable, decinos cuál y proponemos el fallback. Gracias.

## Reply from the VPS dev (2026-11-24)

- 1, 2, 4 and 6 are viable. `deps/` already works: the file map is written verbatim and `local` resolves.
- Exact version: Supra CLI `0.5.0`, toolchain `supra_node_v10.0.6`, compiler commit `19c42ac0`, framework commit `3fecf50d0701f38064faa83c980aabe5c63309fe` (branch `dev`), image `supra-compiler:v10.0.6`.
- 3: there is one lock; a verify would block the IDE. Use `purpose: "verify"` with a second lane and its own cache, or return 503 when the IDE is busy. Do not share the lock.
- 5: keep the IDE allowlist. For verify, the app should resolve third-party git deps and send them as `deps/` locals. If git is needed, implement a strict `https://github.com/` URL check (no userinfo/private IP) + a separate cache + `git_deps: [{repo, rev}]`. The current substring filter has a bypass and must be fixed.
- `purpose: "verify"` is accepted. The 300 s timeout and 5 MB body cap are already in the compose.

App-side response (commit `00357d1`): the verifier sends `purpose: "verify"`, uses `GET /version` when `/compile` omits the version, and rewrites a git dependency to `local = "deps/<name>"` when the submitter provides that tree. The framework stays as the allowlisted git dependency. We start with the 503 fallback; a second lane is operational and needs no app change.
