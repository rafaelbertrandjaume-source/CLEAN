# CLEAN

DAW expérimental piloté par le texte : un agent Claude compose, arrange, conçoit les sons et mixe en agissant directement sur le projet.

## Phase 1 (ce dépôt)

- **Moteur audio** Web Audio : synthé soustractif polyphonique (2 osc + sub + bruit, filtre à enveloppe), batterie synthétique (carte GM), effets par piste (EQ, compresseur, réverbe, delay synchronisé, filtre, distorsion, chorus), limiteur master, ordonnanceur à anticipation, boucle.
- **Interface** : arrangement multipiste (clips déplaçables/redimensionnables), piano roll, panneau instrument & effets, transport, annuler/rétablir, enregistrement/ouverture de projet JSON, export WAV 24 bits.
- **Agent** : 16 outils typés sur le projet + recherche web (côté serveur Anthropic), réflexion adaptative, `analyze_mix` (rendu hors ligne et mesure crête/RMS par piste). Un tour complet de l'agent = une seule entrée d'annulation.
- **Fournisseur local** optionnel : LM Studio (API compatible OpenAI) pour travailler hors ligne.

## Design

Direction visuelle conçue dans Claude Design : https://claude.ai/artifact/UzyVYHqgLdzSwrA6GMcHi3 (session, rack, tokens et composants). Ambre pour le transport et le temps, lilas pour tout ce que fait l'agent ; Instrument Sans + IBM Plex Mono, embarquées via Fontsource (fonctionne hors ligne).

## Lancer

Prérequis : Node 20+. Pour l'app de bureau : Rust (`curl https://sh.rustup.rs -sSf | sh`) et les outils Xcode en ligne de commande (`xcode-select --install`).

```bash
npm install
npm run dev          # version navigateur sur http://localhost:1420
npm run tauri dev    # app de bureau macOS
```

Au premier lancement, ouvre les réglages (⚙) dans le panneau de l'agent et colle une clé API Anthropic.

Raccourcis : Espace lecture/stop, ⌘Z / ⇧⌘Z annuler/rétablir, Suppr efface le clip sélectionné, double-clic sur une piste crée un clip, glisser sur la règle définit la boucle.

## Structure

```
src/state/    modèle de projet (types, presets, opérations, historique)
src/engine/   moteur Web Audio (instruments, effets, graphe, transport, rendu)
src/agent/    prompt système, outils, boucle agentique (Anthropic + local)
src/ui/       composants React
src-tauri/    coquille native Tauri 2
```

## Limites connues

- Dans l'app Tauri, les boutons Enregistrer / Export WAV passent par un téléchargement navigateur, que la WebView macOS ne gère pas : utiliser la version navigateur pour exporter, en attendant le dialogue natif (phase 2).
- La clé API est stockée dans le `localStorage` de l'app : acceptable pour un prototype local, pas pour une distribution.

## Suite

- **Phase 2** : instruments et effets générés en Faust depuis un prompt (compilation WebAssembly à la volée, boucle compile → écoute → correction), serveur Python local (ACE-Step / Stable Audio Open en MLX pour samples, Demucs pour les stems), sampler.
- **Phase 3** : analyse avancée pour l'agent (LUFS BS.1770, spectre, masquage entre pistes), export `.als` vers Ableton Live.
