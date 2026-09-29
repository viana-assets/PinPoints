# E-Mail-Vorlagen für Supabase (26.09.2026)

Drei Vorlagen im Stil der App, statt der englischen Standardmails von Supabase.
Eingetragen werden sie im Supabase-Dashboard unter **Authentication → Emails → Templates**:
Vorlage wählen, **Subject** und **Body** ersetzen, **Save**.

| Supabase-Vorlage | Datei | Betreff (Subject) |
|---|---|---|
| **Invite user** | `einladung.html` | `Deine Einladung zum MR Assistent` |
| **Reset password** | `passwort-zuruecksetzen.html` | `Neues Passwort für den MR Assistent` |
| **Confirm signup** | `email-bestaetigen.html` | `Bitte bestätige deine E-Mail-Adresse` |

Den **ganzen Inhalt** der Datei in das Feld „Body" kopieren (Datei im Editor öffnen, alles
markieren, kopieren).

## Was man nicht ändern darf

- `{{ .ConfirmationURL }}` – der persönliche Link, den Supabase beim Versand einsetzt. Er steht
  zweimal drin: im Knopf und darunter als Text für den Fall, dass der Knopf nicht geht.
- `{{ .Email }}` – die Empfängeradresse im Fuß.

Die App verarbeitet den Link unverändert weiter (`app/auth/HashSessionHandler.tsx` →
`/auth/set-password`); an der Anmeldung selbst ändert sich nichts.

## Warum „Confirm signup" überhaupt

Der MR Assistent hat keine öffentliche Registrierung, Zugänge entstehen nur über die Einladung
(`app/api/invite/route.ts`). Die Bestätigungsmail fällt deshalb normalerweise nicht an – sie
ist nur da, damit auch in dem Fall keine englische Standardmail herausgeht.

## Das Logo

Kommt von `https://pin-points.vercel.app/icons/mr-192.png` (die App-Kachel aus `public/icons`).
Manche Mailprogramme laden Bilder erst nach Zustimmung – dann steht nur der Schriftzug da.

## Falls sich die Vorlagen nicht bearbeiten lassen

Seit 03.06.2026 dürfen **neu angelegte** Supabase-Projekte im kostenlosen Tarif die Vorlagen
nur ändern, wenn ein eigener Mailversand (SMTP, etwa Resend oder der Firmen-Mailserver)
eingetragen ist: Authentication → Emails → SMTP Settings. Ältere Projekte sind nicht betroffen.
Unabhängig davon verschickt der eingebaute Supabase-Versand nur sehr wenige Mails pro Stunde –
für den laufenden Betrieb ist ein eigener SMTP ohnehin der bessere Weg.
