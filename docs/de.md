# Meteoblue

## Überblick

Diese Integration macht die **Forecast API von meteoblue** zu einem Wetteranbieter von Gladys. Nach der Installation nutzen die Wetterkarte des Dashboards und der Chat-Assistent („Wie wird das Wetter morgen?“) sie anstelle des eingebauten OpenWeather-Dienstes.

Sie liefert:

- das **Wetter der aktuellen Stunde**: Temperatur, gefühlte Temperatur, Luftfeuchtigkeit, Luftdruck, Wind, UV-Index, Tag oder Nacht, Sonnenauf- und -untergang;
- die **Vorhersagen**: 24 Stunden und die 7 Tage von meteoblue, mit der **Vorhersagbarkeit**, die meteoblue jedem Tag gibt (wie sehr seine Modelle übereinstimmen);
- drei **Szenen-Auslöser**: Regen in den nächsten 3 Stunden, Frost in den nächsten 12 Stunden, Credits gehen zur Neige;
- drei **Szenen-Aktionen**, vier **Dashboard-Widgets** und das **Meteogramm** von meteoblue (optional).

meteoblue (Basel, Schweiz) kombiniert viele Wettermodelle und korrigiert sie mit nahen Stationen, Radar und Satellit. Alles läuft über die Server von meteoblue (nur Cloud), mit **deinem eigenen API-Schlüssel**: Die kostenlose Testphase der Weather API gibt 10 Millionen Credits für ein Jahr, für nicht-kommerzielle Nutzung, und die Integration verteilt sie selbst über das Jahr.

meteoblue veröffentlicht in dieser API keine amtlichen Warnungen: Der Wetterwarnungs-Auslöser von Gladys bleibt mit diesem Anbieter stumm. Die Regen- und Frost-Auslöser der Integration sind Vorhersagen, keine amtlichen Warnungen.

> Diese Integration wurde noch nicht mit einem echten API-Schlüssel getestet: Sie folgt der Referenz der meteoblue-API genau. Bitte melde jedes Problem.

## Voraussetzungen

- Gladys 5.2.0 oder neuer.
- Ein Zuhause mit Standort (Einstellungen → Zuhause): Die Vorhersage jedes Zuhauses mit Standort wird für die Szenen-Auslöser beobachtet.
- Ein meteoblue-Konto mit **Weather-API**-Zugang (die kostenlose Testphase genügt), für nicht-kommerzielle Nutzung.

## Konfiguration

### 1. Ein meteoblue-Konto und sein kostenloser Schlüssel

1. Lege ein kostenloses Konto auf [meteoblue.com](https://www.meteoblue.com/de/user/login/index) an und melde dich an.
2. Klicke auf das Kontosymbol (oben rechts) → **Account overview** → **Weather API**: Die kostenlose Testphase beginnt sofort, für ein Jahr, mit 10 Millionen Credits. Du bestätigst eine nicht-kommerzielle Nutzung.
3. Kopiere den dort angezeigten **API-Schlüssel**. Schlüssel, die signierte Anfragen verlangen (ein gemeinsames Geheimnis), werden nicht unterstützt.

Die Schritte stammen aus der [meteoblue-Dokumentation](https://docs.meteoblue.com/en/weather-apis/free-weather-api/overview). Weitere Credits lassen sich später kaufen (zum Zeitpunkt des Schreibens 200 € für 200 Millionen, [Preise](https://content.meteoblue.com/en/business-solutions/weather-apis/pricing)).

### 2. Credits und Aktualisierung

meteoblue zählt **Credits**, keine Aufrufe ([Referenz der Forecast API](https://my.meteoblue.com/packages/redoc)). Was die Integration ausgibt:

| Aufruf                                                       | Credits | Mit den 10 Millionen kostenlosen Credits                   |
| ------------------------------------------------------------ | ------- | ---------------------------------------------------------- |
| Aktualisierung der Vorhersage (stündlich + 7 Tage, 1 Aufruf) | 8.000   | etwa 3 am Tag für ein Zuhause, etwa alle 7 Std.            |
| Meteogramm-Bild (optional)                                   | 16.000  | 24 Std. behalten = 5,8 Millionen im Jahr, das halbe Budget |
| „API-Schlüssel testen“                                       | 8.000   | auf Anfrage                                                |

Die Integration zählt, was jede Antwort gekostet hat (meteoblue nennt es in einem Header), speichert den Zähler in `/data` und **verteilt die übrigen Credits auf den Rest des Schlüsseljahres**: Das Aktualisierungsintervall wird berechnet, nie kürzer als die Untergrenze „Aktualisierung höchstens alle“. Eine Reserve von 2 % bleibt für die Test-Schaltfläche. Jedes Zuhause mit Standort wird für sich aktualisiert: Zwei Zuhause werden also halb so oft aktualisiert. Die Vorhersagen bleiben in `/data`: Ein Neustart von Gladys kostet nichts. Sind die Credits des Jahres aufgebraucht, geht bis zum nächsten Schlüsseljahr kein Aufruf mehr hinaus, und die letzte Vorhersage wird geliefert, solange sie die aktuelle Stunde abdeckt (7 Tage).

### 3. In Gladys

1. Integrationen → Meteoblue → Konfiguration.
2. Füge den **API-Schlüssel** ein. Gib den **Beginn des Schlüsseljahres** ein, wenn du ihn kennst (der Tag, an dem du die Weather API aktiviert hast), sonst gilt der erste Nutzungstag.
3. Speichern, dann auf **API-Schlüssel testen** klicken: Sie liest jetzt die Vorhersage deines ersten Zuhauses (8.000 Credits) und zeigt die genutzten Credits und das Aktualisierungsintervall, das sie erlauben.

| Feld                                 | Standard   | Zweck                                                         |
| ------------------------------------ | ---------- | ------------------------------------------------------------- |
| API-Schlüssel                        | —          | Dein meteoblue-Schlüssel, als Geheimnis gespeichert           |
| Credits pro Schlüsseljahr            | 10.000.000 | Nach einem Credit-Kauf erhöhen; nie überschritten             |
| Beginn des Schlüsseljahres           | leer       | JJJJ-MM-TT; leer = der erste Nutzungstag des Schlüssels       |
| Aktualisierung höchstens alle (Min.) | 60         | 30 bis 1.440: eine Untergrenze, meist entscheiden die Credits |
| Meteogramm anzeigen                  | aus        | Das 5-Tage-Meteogramm, 16.000 Credits pro Bild                |
| Meteogramm behalten (Stunden)        | 24         | 3 bis 168: Ein Bild wird nur geladen, wenn jemand es ansieht  |

## Nutzung

### Wetterkarte und Assistent

Nichts zu tun: Die Wetterkarte des Dashboards nutzt diesen Anbieter. Sind mehrere Wetteranbieter installiert, hefte einen in den Einstellungen der Karte an. Mit eingeschaltetem Meteogramm bietet die Karte es als Anbieterbild an. meteoblue deckt die ganze Welt ab; die Vorhersage eines Zuhauses wird in der Zeitzone von Gladys in Tage geteilt.

### Widgets

![Generierte Illustration der vier Widgets — 7-Tage-Vorhersage, nächste Stunden, Meteogramm, Credits — kein Screenshot](https://raw.githubusercontent.com/William-De71/gladys-meteoblue/main/docs/assets/widgets.de.png)

- **7-Tage-Vorhersage**: 3, 5 oder 7 Tage mit den meteoblue-Piktogrammen, Höchst- und Tiefstwert, Himmel, Niederschlagsrisiko; tippe auf einen Tag für Menge und Stunden des Niederschlags, Wind, UV-Index, Vorhersagbarkeit und Sonnenzeiten. Ein Tag mit geringer Vorhersagbarkeit ohne Regen erhält ein Abzeichen.
- **Nächste Stunden**: ein Verlauf der nächsten 12, 24 oder 48 Stunden: Temperatur und gefühlte Temperatur, Niederschlag oder Wind.
- **Meteogramm**: das 5-Tage-Meteogramm von meteoblue (Temperatur, Wolken, Niederschlag, Wind), wenn es in der Konfiguration eingeschaltet ist.
- **meteoblue-Credits**: die in diesem Schlüsseljahr genutzten und übrigen Credits, das erlaubte Aktualisierungsintervall, die übrigen Tage und der letzte Aufruf.

Die Vorhersage-Widgets haben eine Einstellung **Zuhause** (leer für das erste Zuhause mit Standort), nennen ihre Quelle und verlinken auf die meteoblue-Seite desselben Ortes.

### Szenen-Auslöser

- **Bald Regen erwartet**: Die Vorhersage zeigt jetzt Niederschlag in den nächsten 3 Stunden (mindestens 0,2 mm in einer Stunde und ein Risiko von mindestens 40 %, wenn meteoblue eines angibt), nach einer Prüfung ohne Niederschlag. Filter: Zuhause, Art (Regen, Schnee, Schneeregen). Variablen: Zuhause, Art, Beginn, Minuten bis zum Beginn, Menge in 3 Stunden, Risiko, Himmel.
- **Frost erwartet**: Die Vorhersage zeigt jetzt 0 °C oder weniger in den nächsten 12 Stunden. Variablen: Zuhause, Beginn, Stunden bis zum Beginn, tiefste Temperatur und ihre Uhrzeit.
- **meteoblue-Credits gehen zur Neige**: 75, 90 oder 100 % der Credits des Schlüsseljahres sind genutzt, jede Stufe einmal pro Schlüsseljahr. Variablen: Stufe, genutzte Credits, pro Jahr, übrig, nächstes Schlüsseljahr.

Die Überwachung sieht sich alle 10 Minuten die zwischengespeicherte Vorhersage an (ohne Credits zu verbrauchen). Die erste Prüfung nach einem Start dient als Referenz: Ein bereits erwarteter Regen löst nichts aus. Die Vorhersage ist so frisch, wie die Credits es erlauben (mit dem kostenlosen Schlüssel höchstens etwa 7 Stunden alt, für ein Zuhause).

### Szenen-Aktionen

- **Vorhersage eines Tages abrufen**: heute bis in 6 Tagen: Höchst- und Tiefstwert, Himmel, Menge und Risiko des Niederschlags, Vorhersagbarkeit, max. Wind, Zusammenfassung.
- **Aktuelles Wetter abrufen**: Temperatur, gefühlte Temperatur, Luftfeuchtigkeit, Wind, Himmel und Zusammenfassung der aktuellen Stunde.
- **Wird es regnen?**: innerhalb von 3 bis 24 Stunden: ja oder nein, ab wann, Regen oder Schnee, Summe, max. Risiko, Zusammenfassung.

### Szenen-Beispiele

- Wenn **bald Regen erwartet** wird (Zuhause „Zuhause“, Art „Regen“) → „Wäsche reinholen: `{{triggerEvent.data.kind}}` ab `{{triggerEvent.data.start_time}}`“ an dein Telefon senden.
- Wenn **Frost erwartet** wird → das Wasserventil im Garten schließen und `{{triggerEvent.data.min_temperature}}` °C um `{{triggerEvent.data.coldest_time}}` senden.
- Jeden Abend um 20:00 → **Wird es regnen?** (12 Stunden) → wenn kein Niederschlag erwartet wird, die Gartenbewässerung starten.

### Namensnennung und nicht-kommerzielle Nutzung

Der kostenlose Schlüssel gilt für **nicht-kommerzielle Nutzung** ([meteoblue-Bedingungen](https://content.meteoblue.com/en/about-us/legal/commercial-non-commercial-use)), die einen direkten Link zu meteoblue für denselben Ort verlangt: Jedes Vorhersage-Widget nennt meteoblue und trägt diesen Link, und das Meteogramm behält das meteoblue-Logo. Die Wetter-Piktogramme sind die von meteoblue, zur freien Nutzung angeboten mit einem Link auf ihre [Piktogramm-Seite](https://docs.meteoblue.com/en/meteo/variables/pictograms); die Integration lädt sie bei meteoblue, nie dein Browser. Wetterdaten © meteoblue AG.

## Fehlerbehebung

- **„meteoblue hat den API-Schlüssel abgelehnt (invalid)“**: Der Schlüssel ist falsch; kopiere ihn erneut aus Account overview → Weather API.
- **„(missing)“**: Kein Schlüssel in der Konfiguration gespeichert.
- **„Zugang dieses Schlüssels ist abgelaufen“**: Das kostenlose Jahr ist vorbei; verlängere es oder kaufe Credits auf meteoblue.com.
- **„verlangt signierte Anfragen“**: Der Schlüssel ist durch ein gemeinsames Geheimnis geschützt, nicht unterstützt; nutze einen Schlüssel ohne Signatur.
- **„wegen Credits oder Ratenlimit abgelehnt“**: Der Zähler von meteoblue ist aufgebraucht, oder im Konto ist ein Tageslimit für den Schlüssel gesetzt; bis dahin wird die zwischengespeicherte Vorhersage geliefert.
- **„Credits des Schlüsseljahres aufgebraucht“**: Die Obergrenze der Integration ist erreicht; erhöhe „Credits pro Schlüsseljahr“ nach einem Kauf oder warte auf das nächste Schlüsseljahr. Die meteoblue-Kontoseite ist maßgeblich (sie zählt auch andere Nutzungen des Schlüssels).
- **Die Vorhersage wirkt alt**: Die kostenlosen Credits erlauben etwa alle 7 Stunden eine Aktualisierung für ein Zuhause; das Widget „meteoblue-Credits“ zeigt das Intervall.
- **Kein Wetter für ein Zuhause**: Es hat in Gladys keinen Standort.
- Protokolle: Einstellungen → Supervision → Meteoblue. Der Schlüssel erscheint dort nie.
