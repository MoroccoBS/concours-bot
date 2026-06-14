# 🏥 Concours Bot — QCM Discord

Bot Discord pour s'entraîner aux QCM du concours avec des amis. Crée des sondages interactifs A/B/C/D(/E), révèle les réponses, et suit les scores par session.

---

## ✨ Commandes

| Commande | Description |
|---|---|
| `/qcm` | Crée un QCM avec A/B/C/D (et E optionnel) |
| `/reveal` | Révèle la réponse avant la fin du timer |
| `/session start questions:N` | Démarre une session de N questions |
| `/session scores` | Affiche le classement en cours |
| `/session end` | Termine la session et affiche le classement final |
| `/concours list` | Liste les concours importés depuis les PDFs |
| `/concours select bank:...` | Choisit un concours pour le salon |
| `/concours next` | Poste la prochaine question du concours choisi |
| `/concours status` | Affiche la progression du salon |
| `/ping` | Vérifie que le bot est en ligne |

### Exemple de flux typique

```
/session start questions:10

/qcm question:"La HAS est créée par quelle loi ?"
      a:"Loi 07-22" b:"Loi 08-22" c:"Loi 131-13" d:"Loi 34-09"
      answer:A duration:45

→ Tout le monde vote en cliquant sur 🇦 🇧 🇨 🇩
→ Correction automatique après 45 secondes (ou /reveal)

/session scores   ← voir le classement
/session end      ← classement final
```

### Flux avec concours importé

```
/concours list
/concours select bank:Concours-Radiologie-Aptitude-2024
/concours next

→ Tout le monde vote
→ /reveal affiche la correction si elle existe dans la banque
→ /concours next poste la question suivante

/concours status  ← voir combien de questions ont été couvertes
```

---

## 🚀 Installation (Windows + Bun)

### 1. Prérequis

- [Bun](https://bun.sh/) installé (`winget install Oven-sh.Bun`)
- Node n'est pas requis — bun suffit

### 2. Créer le bot Discord

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application** → donne un nom
3. Onglet **Bot** → **Add Bot**
4. Copie le **Token** (garde-le secret !)
5. Active les Privileged Intents :
   - ✅ `SERVER MEMBERS INTENT`
   - ✅ `MESSAGE CONTENT INTENT`
6. Onglet **OAuth2 → URL Generator** :
   - Scopes : `bot` + `applications.commands`
   - Bot Permissions : `Send Messages`, `Embed Links`, `Read Message History`
   - Copie le lien généré et invite le bot sur ton serveur

### 3. Configurer le projet

```bat
cd concours-bot
copy .env.example .env
```

Édite `.env` :

```env
DISCORD_TOKEN=ton_token_ici
CLIENT_ID=ton_application_id_ici
GUILD_ID=id_de_ton_serveur_ici   ← recommandé en dev (commandes instantanées)
```

> **Comment trouver les IDs ?**
> - **CLIENT_ID** : Onglet *General Information* → *Application ID*
> - **GUILD_ID** : Clique droit sur ton serveur → *Copier l'identifiant du serveur*  
>   (nécessite le Mode Développeur activé dans Paramètres → Avancé)

### 4. Installer et lancer

```bat
bun install
bun run deploy     ← enregistre les commandes slash (à faire une seule fois)
bun run dev        ← lance le bot avec rechargement automatique
```

Pour la production :

```bat
bun run start
```

---

## 📁 Structure du projet

```
concours-bot/
├── src/
│   ├── index.ts              ← Point d'entrée
│   ├── config.ts             ← Variables d'env
│   ├── deploy.ts             ← Enregistrement des slash commands
│   ├── types.ts              ← Types TypeScript
│   ├── store/
│   │   ├── pollStore.ts      ← Polls actifs (en mémoire)
│   │   └── sessionStore.ts   ← Sessions actives (en mémoire)
│   ├── commands/
│   │   ├── index.ts          ← Registre des commandes
│   │   ├── qcm.ts            ← /qcm
│   │   ├── reveal.ts         ← /reveal
│   │   ├── session.ts        ← /session
│   │   └── ping.ts           ← /ping
│   ├── handlers/
│   │   ├── commandHandler.ts ← Route les slash commands
│   │   └── buttonHandler.ts  ← Gère les votes (boutons)
│   └── utils/
│       ├── embeds.ts         ← Builders d'embeds Discord
│       ├── buttons.ts        ← Builders de boutons
│       └── reveal.ts         ← Logique de correction partagée
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## 🔧 Notes

- **Un seul QCM actif par salon** — créer un second `/qcm` est bloqué tant que le premier n'est pas révélé.
- **Les votes sont secrets** — personne ne voit les choix des autres avant la correction.
- **Changement de vote autorisé** — on peut revoter jusqu'à la correction.
- **Les scores sont en mémoire** — ils sont perdus si le bot redémarre. Pour persister, il faudrait ajouter une base de données (SQLite avec bun:sqlite par exemple).
