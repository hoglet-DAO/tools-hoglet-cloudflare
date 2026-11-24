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
