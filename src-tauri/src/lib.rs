// Coquille native minimale : toute la logique (moteur audio, agent) vit dans le frontend web.
// Phase 2 : c'est ici que viendront le lancement du serveur de génération Python (sidecar)
// et l'accès fichiers natif.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}
