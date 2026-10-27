"""
Conversion Mixamo (FBX) → un seul fichier GLB animé, avec Blender en ligne de commande.

Fusionne sur le squelette du personnage toutes les animations d'un dossier
(une animation par fichier FBX) et les renomme d'après le nom du fichier :
idle.fbx → Idle, walk.fbx → Walk, run.fbx → Run, sit.fbx → Sit,
sit-idle.fbx → SitIdle, dance.fbx → Dance.

Usage (Blender 3.6 ou plus récent) :
  blender -b -P scripts/fbx-to-glb.py -- \
      --personnage public/assets/raw/lui/personnage.fbx \
      --animations public/assets/raw/lui/animations \
      --sortie public/assets/models/lui.glb

Puis, dans config.json : "avatars": { "lui": { ..., "modele": "assets/models/lui.glb" } }

Remarque : script fourni sans avoir pu être exécuté sur la machine de
développement (Blender n'y était pas installé).
"""
import argparse
import os
import sys

import bpy

NOMS = [
    ("sit-idle", "SitIdle"),
    ("sitidle", "SitIdle"),
    ("sitting-idle", "SitIdle"),
    ("idle", "Idle"),
    ("walk", "Walk"),
    ("run", "Run"),
    ("jog", "Run"),
    ("sit", "Sit"),
    ("danc", "Dance"),
]


def nom_animation(fichier):
    base = os.path.splitext(os.path.basename(fichier))[0].lower().replace("_", "-").replace(" ", "-")
    for motif, nom in NOMS:
        if motif in base:
            return nom
    return os.path.splitext(os.path.basename(fichier))[0]


def armature_de(objets):
    return next((o for o in objets if o.type == "ARMATURE"), None)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--personnage", required=True, help="FBX du personnage, téléchargé « With Skin »")
    p.add_argument("--animations", required=True, help="Dossier des FBX d'animation, téléchargés « Without Skin »")
    p.add_argument("--sortie", required=True, help="Fichier .glb à produire")
    args = p.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.abspath(args.personnage), automatic_bone_orientation=False)
    arm = armature_de(bpy.context.scene.objects)
    if arm is None:
        sys.exit("Aucun squelette trouvé dans le personnage.")
    arm.animation_data_create()

    # Les animations éventuellement fournies avec le personnage sont retirées.
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

    fichiers = sorted(f for f in os.listdir(args.animations) if f.lower().endswith(".fbx"))
    if not fichiers:
        sys.exit("Aucun fichier .fbx dans le dossier d'animations.")

    for f in fichiers:
        avant = set(bpy.data.objects)
        actions_avant = set(bpy.data.actions)
        bpy.ops.import_scene.fbx(filepath=os.path.abspath(os.path.join(args.animations, f)), automatic_bone_orientation=False)
        nouvelles = [a for a in bpy.data.actions if a not in actions_avant]
        if nouvelles:
            action = nouvelles[0]
            action.name = nom_animation(f)
            action.use_fake_user = True
            piste = arm.animation_data.nla_tracks.new()
            piste.name = action.name
            piste.strips.new(action.name, int(action.frame_range[0]), action)
            print(f"  + {f} → {action.name}")
        else:
            print(f"  ! {f} : aucune animation trouvée")
        for o in [o for o in bpy.data.objects if o not in avant]:
            bpy.data.objects.remove(o, do_unlink=True)

    arm.animation_data.action = None
    os.makedirs(os.path.dirname(os.path.abspath(args.sortie)), exist_ok=True)
    options = dict(filepath=os.path.abspath(args.sortie), export_format="GLB", export_animations=True, export_yup=True)
    try:
        # Blender 4.x : une animation glTF par action
        bpy.ops.export_scene.gltf(**options, export_animation_mode="ACTIONS")
    except TypeError:
        # Blender 3.x
        bpy.ops.export_scene.gltf(**options, export_nla_strips=True)
    print(f"GLB écrit : {args.sortie}")


main()
