# HOTW Character Catalog

This repository contains the downloadable characters for Hands on the Wheel (HOTW) for BeamNG.drive. Character assets are stored unpacked so you can inspect the files that the catalog installs.

## Submit a character

1. Fork this repository and create a branch in your fork.
2. Export your character against HOTW's shared full-body skeleton. Use an existing character as a reference for the bone names, bind pose, mesh metadata, foot contacts, and material layout. Include assets you have permission to share and credit their original creators.
3. Create a folder under `characters/` using a unique ID of up to 40 characters. Use lowercase letters, numbers, hyphens, or underscores, and start with a letter or number. The ID `default` is reserved.
4. Add the files listed below. Set the ID, display name, and author in `character.json`.
5. From the repository root, run `python tools/update_catalog.py`. Review the generated `catalog.json`, then commit it together with the character folder and open a pull request against `characters`.

```json
{
  "id": "example-driver",
  "name": "Example Driver",
  "author": "Original Artist"
}
```

| File | Contents |
| --- | --- |
| `character.json` | ID, display name, and author credit |
| `fullbody.xml` | Rigged Collada model exported for HOTW |
| `fullbody.json` | Mesh metadata used for in-game visibility |
| `feet.json` | Left and right foot contact points |
| `materials.json` | BeamNG materials owned by this character |
| `colors.json` | Optional recolor bindings. Use `[]` if the character has none |
| `thumbnail.png` | 256 × 256 portrait. Match the framing and background of the existing portraits |
| `textures/` and `pbr/` | PNG and DDS texture assets referenced by the character |

Material names and `mapTo` values must start with `hotw_character_<id>_`, replacing hyphens in the ID with underscores for the material name. Texture paths in the material and recolor files should point to `/hotw/characters/<id>/` and stay within that character's folder. Keep the model's Collada references local to the asset. The catalog accepts model, texture, and metadata files.

## How the catalog verifies downloads

Run the generator again whenever any asset changes. It reads each file as bytes and records its relative `path`, its exact byte count as `size`, and its SHA-256 checksum as `sha256`. The HOTW Hub checks the size and checksum before installing a character. The generator uses Python's standard library.

In the pull request, include an in-game screenshot, the source and redistribution terms for the model and textures, and any notes about the rig or materials. The catalog reads the manifest from `characters`, so the character becomes available after the pull request is merged.
