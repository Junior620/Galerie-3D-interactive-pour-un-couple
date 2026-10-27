import type * as THREE from 'three';
import type { Musee } from '../config/types';
import type { DeviceProfile } from '../utils/device';
import { getProceduralClips, SIT_BACK, type AnimName } from './animations';
import { Avatar, type AvatarRig, type Who } from './Avatar';
import { loadGltfRig } from './gltfAvatar';
import { createProceduralAvatar, SK } from './proceduralAvatar';

/**
 * Crée les deux avatars. Ordre de priorité : modèle .glb indiqué dans
 * config.json (s'il existe et se charge), sinon avatar procédural.
 * L'application ne plante donc jamais si un modèle manque.
 */
export async function createAvatars(musee: Musee, profile: DeviceProfile, manager: THREE.LoadingManager): Promise<Record<Who, Avatar>> {
  const make = async (who: Who): Promise<Avatar> => {
    const cfg = musee.config.avatars[who];
    let rig: AvatarRig | null = null;
    if (cfg.modele) {
      if (!musee.hasFile(cfg.modele)) {
        console.warn(`[musée] Modèle introuvable : public/${cfg.modele} — avatar procédural utilisé.`);
      } else {
        try {
          rig = await loadGltfRig(cfg, who, manager, profile.shadows);
        } catch (e) {
          console.warn(`[musée] Échec du chargement de ${cfg.modele} — avatar procédural utilisé.`, e);
        }
      }
    }
    if (!rig) {
      const clips = new Map<AnimName, THREE.AnimationClip>(getProceduralClips().map((c) => [c.name as AnimName, c]));
      rig = {
        model: createProceduralAvatar(cfg, who, profile.shadows),
        clips,
        scale: cfg.taille,
        sitBack: SIT_BACK,
        height: SK.height * cfg.taille,
        procedural: true,
      };
    }
    return new Avatar(who, musee.config.prenoms[who], rig);
  };
  const [lui, elle] = await Promise.all([make('lui'), make('elle')]);
  return { lui, elle };
}
