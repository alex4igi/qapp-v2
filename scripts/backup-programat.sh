#!/bin/bash
# Backup zilnic automat al bazei, prin launchd, pe laptop: backup-export.mjs, cu ultimele 7
# copii complete păstrate în ~/quasar-backup/supabase/.
#
#   bash scripts/backup-programat.sh install     # instalează / actualizează jobul (din repo)
#   bash scripts/backup-programat.sh uninstall   # îl scoate
#   bash scripts/backup-programat.sh             # un backup acum, fără condiții
#
# Jobul NU e pe oră fixă: pe un laptop, ora fixă pică des în somn și macOS nu o recuperează
# sigur (2026-09-22: 13:00 ratat, laptop deschis la 15:55). Pornește din oră în oră în modul
# `auto`, care face backup doar dacă ultima copie completă are peste 20 de ore și laptopul e
# treaz de-a binelea. În trezirile scurte de mentenanță (capac închis) un backup de 3 minute
# se rupe pe bucăți între adormiri: așa a picat schema pe 2026-09-21.
#
# Notificare macOS doar dacă nu există o copie completă de 48 de ore, cel mult o dată la 12 ore:
# o rulare picată care reușește ora următoare nu e o problemă.
#
# macOS nu lasă un job launchd să citească din ~/Documents (unde stă repo-ul): install copiază
# scriptul și cele două chei de care are nevoie în ~/Library/Application Support/QuasarBackup.
# ⇒ După o modificare în backup-export.mjs / acest fișier sau o cheie rotită, rulează din nou `install`.
#
# Log: ~/Library/Logs/quasar-backup.log
set -u

LABEL=ro.quasardance.backup
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
RUNTIME="$HOME/Library/Application Support/QuasarBackup"
BACKUP_ROOT="$HOME/quasar-backup/supabase"
NOTIFY_STAMP="$HOME/quasar-backup/.ultima-notificare"
LOG="$HOME/Library/Logs/quasar-backup.log"
KEEP=7
MIN_AGE_H=20
ALERT_AGE_H=48
HERE="$(cd "$(dirname "$0")" && pwd)"
# launchd pornește cu PATH minimal: fără asta nu găsește node, npx și pg_dump.
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/libpq/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if [ -f "$HERE/.env" ]; then ENV_FILE="$HERE/.env"; else ENV_FILE="$HERE/../.env.local"; fi

# Orele de la ultima copie completă (cu storage); 99999 dacă nu există niciuna.
latest_full_age_h() {
  node -e '
    const fs = require("fs"), path = require("path"), root = process.argv[1]
    let best = 0
    try {
      for (const n of fs.readdirSync(root)) {
        try {
          const m = JSON.parse(fs.readFileSync(path.join(root, n, "manifest.json"), "utf8"))
          if (m.complete === true && m.storage && typeof m.storage === "object") best = Math.max(best, Date.parse(m.finished_at) || 0)
        } catch {}
      }
    } catch {}
    console.log(best ? Math.floor((Date.now() - best) / 3600e3) : 99999)
  ' "$BACKUP_ROOT"
}

maybe_notify() {
  local age
  age=$(latest_full_age_h)
  [ "$age" -ge "$ALERT_AGE_H" ] || return 0
  if [ -f "$NOTIFY_STAMP" ] && [ $(( $(date +%s) - $(stat -f %m "$NOTIFY_STAMP") )) -lt 43200 ]; then return 0; fi
  local cand="de $(( age / 24 )) zile"
  [ "$age" -ge 99999 ] && cand="deloc"
  osascript -e "display notification \"Nu există un backup complet $cand. $1 Detalii: ~/Library/Logs/quasar-backup.log\" with title \"Backup Quasar\" sound name \"Basso\"" >/dev/null 2>&1 || true
  mkdir -p "$(dirname "$NOTIFY_STAMP")" && touch "$NOTIFY_STAMP"
}

do_backup() {
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') ==="
  local free_gb
  free_gb=$(df -g "$HOME" | awk 'NR==2 {print $4}')
  if [ "${free_gb:-0}" -lt 2 ]; then
    echo "Sărit: doar ${free_gb} GB liberi pe disc."
    maybe_notify "Pe disc sunt doar ${free_gb} GB liberi."
    return 1
  fi
  # La trezirea din sleep rețeaua mai are nevoie de câteva secunde.
  local url
  url=$(grep '^VITE_SUPABASE_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    curl -s -o /dev/null --max-time 5 "$url/rest/v1/" && break
    sleep 10
  done
  # caffeinate -i: laptopul nu adoarme din inactivitate cât rulează backup-ul (~3 minute).
  # Rândurile „tabel: N" (101 pe rulare) umflă logul degeaba; cifrele sunt în manifest.json.
  BACKUP_ENV_FILE="$ENV_FILE" caffeinate -i node "$HERE/backup-export.mjs" --keep=$KEEP 2>&1 \
    | grep -v '^  [a-z_0-9]*: [0-9]*$'
  local status=${PIPESTATUS[0]}
  if [ "$status" -ne 0 ]; then
    maybe_notify "Ultima încercare a eșuat."
    return "$status"
  fi
}

case "${1:-run}" in
  install)
    [ -f "$HERE/../.env.local" ] || { echo "Rulează install din repo (lipsește .env.local)." >&2; exit 1; }
    mkdir -p "$RUNTIME" "$(dirname "$PLIST")" "$(dirname "$LOG")"
    cp "$HERE/backup-export.mjs" "$HERE/backup-programat.sh" "$RUNTIME/"
    # Doar cheile de care are nevoie backup-ul, nu tot .env.local.
    ( umask 077; grep -E '^(VITE_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' "$HERE/../.env.local" > "$RUNTIME/.env" )
    [ "$(wc -l < "$RUNTIME/.env")" -eq 2 ] || { echo "Nu găsesc ambele chei în .env.local." >&2; exit 1; }
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$RUNTIME/backup-programat.sh</string>
    <string>auto</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF
    plutil -lint "$PLIST" >/dev/null || exit 1
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
    launchctl bootstrap "gui/$(id -u)" "$PLIST" || exit 1
    echo "Instalat: verifică din oră în oră, face backup când ultimul complet are peste ${MIN_AGE_H}h. Păstrează $KEEP copii în $BACKUP_ROOT. Log: $LOG"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
    rm -f "$PLIST"
    rm -rf "$RUNTIME"
    echo "Dezinstalat (backup-urile din ~/quasar-backup rămân)."
    ;;
  auto)
    # Fără „Graphics" = trezire scurtă de mentenanță (capac închis), nu utilizare reală.
    pmset -g systemstate | grep -q Graphics || exit 0
    [ "$(latest_full_age_h)" -ge "$MIN_AGE_H" ] || exit 0
    do_backup
    ;;
  run)
    do_backup
    ;;
  *)
    echo "Folosire: bash scripts/backup-programat.sh [install|uninstall]" >&2
    exit 2
    ;;
esac
