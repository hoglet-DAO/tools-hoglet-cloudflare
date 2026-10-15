/**
 * Builds the prompt the workspace hands to an AI assistant.
 *
 * Everything here is derived from what the compile service and the factory actually enforce — the framework
 * pin, the `sources/` layout, the named-address rule, the identifier limits, the upgrade policy. An AI that
 * follows it produces a package that compiles and publishes on the first try; one that guesses produces
 * something that compiles and then fails on-chain with a self-address mismatch, which is the failure this
 * exists to prevent.
 *
 * The address is the point: it is derived from the connected wallet and the package name, so it cannot be
 * chosen — it can only be handed to the model up front, which is what this does.
 */
export function buildContractGuide(name: string, target: string): string {
  return `You are writing a Move package for Supra L1, an Aptos Move fork whose framework module is
\`supra_framework\`. I will paste your answer into a browser IDE that compiles it (\`supra move tool compile\`)
and publishes it through a factory contract, so it has to match the layout below exactly.

## Where it will be published

The package is published into a deterministic Resource Account derived from my wallet and the package name.
My package name is **${name}** and the account it must be published to is:

    ${target}

That address is passed to the compiler as the named address. It is the single most important rule here: a
module's self address is baked into its bytecode at compile time, and \`code::publish_package\` rejects a
module whose self address differs from the account it is published to. A wrong address compiles cleanly and
then fails after the transaction is signed, so getting this right is not cosmetic.

## File layout

Give me exactly these files, each with its full contents in a fenced code block labelled with its path:

    Move.toml
    sources/<ModuleName>.move        (as many modules as the package needs)

### Move.toml

Use exactly this shape — the named address key is the package name, the value is the address above:

\`\`\`toml
[package]
name = "${name}"
version = "0.0.1"

[addresses]
${name} = "${target}"

[dependencies.SupraFramework]
git = "https://github.com/Entropy-Foundation/aptos-core.git"
rev = "dev"
subdir = "aptos-move/framework/supra-framework"
\`\`\`

Do not add any other dependency: the compile service has an allowlist and rejects git dependencies outside
it with a 400 before anything is compiled.

### Sources

- Every module lives under \`sources/\`. The compiler only reads that directory.
- Each module declares \`module ${name}::<ModuleName>\`.
- Module names start with an uppercase letter by convention, and the file name mirrors the module
  (\`sources/Pool.move\` for \`Pool\`).
- \`init_module\` runs exactly once, when the package is first published. Never on an upgrade. Keep it
  empty unless the package genuinely needs on-chain setup.

## Hard limits

- Package name: matches ^[A-Za-z_][A-Za-z0-9_]{0,38}$ — letters, digits and underscores, starting with a
  letter or an underscore, at most 39 characters.
- Module file paths: only A-Za-z0-9 _ - . / , must start with \`sources/\` and end in \`.move\`.
- Nothing outside those characters, in any file name.

## Upgrade compatibility (this package will be upgraded later)

The upgrade policy is "compatible", so once it is published:
- do not change the fields, abilities or order of any existing struct;
- do not change the signature of any existing public function;
- adding modules, structs and functions is fine;
- do not rename or delete an existing module — a later version has to still contain every module the
  previous one had, or the upgrade is rejected.

## Size

Keep the source in the low hundreds of kilobytes. Prefer several small modules over one big one: the
on-chain package metadata is capped, and there is no chunked publish on Supra, so a package that does not
fit has to be split by hand.

## What to return

The full contents of every file, in fenced code blocks labelled with their path, in the order Move.toml then
the sources. No commentary beyond the files unless I ask for it.
`;
}
