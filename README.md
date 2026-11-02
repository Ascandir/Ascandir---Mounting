# Ascandir - DnD5e Mounting

Ein Foundry-VTT-Modul (v14, dnd5e 6.x) zum Aufsitzen auf Reittiere. Reiter und Reittier werden zu einem Token mit eigenem Bild – zum Beispiel der Paladin auf seinem Schlachtross.

## Installation

In Foundry unter **Add-on Modules → Install Module** diese Manifest-URL eintragen:

```
https://github.com/Ascandir/Ascandir---Mounting/releases/latest/download/module.json
```

## So funktioniert es

**Aufsitzen**

1. Mit dem eigenen Token neben das Reittier laufen.
2. Rechtsklick auf den eigenen Token (oder auf das Reittier, falls es dir gehört) → links im Menü auf das **Pferd-Symbol**.
3. Im Fenster ein Bild für „Reiter + Reittier“ auswählen. Das Bild wird für diese Kombination gespeichert und beim nächsten Mal vorgeschlagen. Bleibt das Feld leer, wird das Bild des Reittiers genommen.
4. **Aufsitzen** klicken.

Der eigene Token bekommt das Reiter-Bild und die Größe des Reittiers. Das Reittier bleibt unsichtbar darunter und läuft automatisch mit.

**Absitzen**

Rechtsklick auf den kombinierten Token → **Absitzen**. Der Reiter wird auf ein freies Feld neben das Reittier gestellt. Alternativ einfach den Effekt „Beritten“ beim Charakter löschen.

**Anvisieren**

Wer den kombinierten Token mit **T** oder Doppel-Rechtsklick anvisiert, bekommt zwei kleine Bilder angezeigt und wählt, ob der **Reiter** oder das **Reittier** gemeint ist. Angriff und Schaden gehen dann an den Gewählten. Nochmal **T** hebt die Auswahl auf.

**Bewegung**

Solange der Charakter beritten ist, hat er die Bewegung des Reittiers (Laufen, Fliegen, Schwimmen usw.). Ändert sich die Bewegung des Reittiers, zum Beispiel durch Hast, wird das übernommen.

## Wichtig

- Für Auf- und Absitzen muss ein **Spielleiter online** sein, weil dabei Tokens geändert werden, die dem Spieler nicht gehören.
- Für den Bild-Auswahl-Knopf brauchen Spieler das Recht „Dateibrowser benutzen“. Ohne das Recht kann man den Bildpfad auch von Hand eintragen.

## Einstellungen (Spielleiter)

| Einstellung | Standard |
|---|---|
| Maximaler Abstand zwischen Reiter und Reittier | 1 Feld |
| Reittier muss mindestens eine Größe größer sein (5e-Regel) | an |
| Chatnachricht beim Auf-/Absitzen mit Hinweis auf die Kosten (halbe Bewegung) | an |
