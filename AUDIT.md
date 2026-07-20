# Audit bot parkgym.fit — administrare, transparență, monitorizare

Data: 2026-07-20. Scop: ce are botul acum, ce funcționează, ce lipsește — privit
din trei unghiuri: **administrare** (control), **transparență** (ce vede lumea /
adminul), **monitorizare** (știm că merge și că nu s-a pierdut nimic).

---

## 1. Ce funcționează azi (live)

- **Sondaj automat** în grup, cu zile/oră configurabile din dashboard (aplicare în ~1 min).
- **Board live** pe mesajul sondajului — se actualizează în loc, fără notificări, la fiecare vot (✅ Vin / ❌ Nu vin cu nume, „fără răspuns" ca număr).
- **Înregistrarea prezenței** (yes/no per sesiune) + marcaj 🆓 „primul antrenament".
- **Zero vot pierdut** — cine apasă și nu e în bază e creat automat cu numele din Telegram, iar votul se salvează pe loc (robust la erori/curse).
- **Logare completă a voturilor** — `[vote] recorded / FAILED / LOST` + `auto-created` în logurile Railway.
- **Înscriere prin `/start`** (formular de nume).
- **Raport de dimineață** în privat către admini (vin / nu vin / fără răspuns).
- **Alertă săptămânală** către admini (inactivi 2+ săptămâni, nevenit niciodată).
- **Scoatere din grup** din dashboard (coadă de comenzi → botul dă afară, dacă e admin).
- **Rol de admin** (`is_admin`) — adminii sunt protejați de scoatere.
- **Dashboard** (parkgym.fit): analiză prezențe, sesiuni, legare/creare conturi, panou de configurare, auto-refresh la 15s.

Fundație solidă. Restul auditului = ce ar ridica botul de la „merge" la „instrument de administrare complet".

---

## 2. Administrare (control)

| Lipsă | De ce contează | Prioritate |
| --- | --- | --- |
| **„Trimite sondaj acum"** (buton) | Azi, ca să trimiți un sondaj în afara orarului, trebuie umblat la oră + resetat sesiunea. Un buton rezolvă frustrarea și dă control real. | 🔴 mare |
| **Editare text sondaj / oră antrenament / locație** din UI | Acum sunt hardcodate în cod. Nu poți schimba mesajul sau detaliile antrenamentului fără deploy. | 🟠 medie |
| **Anulare / sărire sesiune** (sărbătoare, vreme) | Nu există „nu e antrenament joi". Botul postează oricum. | 🟠 medie |
| **Corectare manuală a prezenței** din UI | Poți doar prin DB. Adminul ar trebui să poată marca/scoate un „Vin" pentru o sesiune direct din dashboard. | 🟠 medie |
| **Îmbinare membri duplicat** | Auto-crearea poate face duplicate (ex. „Artur" existent + „Artur" nou din alt cont). Nu există unealtă de îmbinare. | 🟠 medie |
| **Curățare nume „junk"** (ex. „L") | Nume scurte/emoji din Telegram. Există editarea, dar nu un flux dedicat de curățare. | 🟢 mică |

---

## 3. Transparență (ce vede adminul / grupul)

| Lipsă | De ce contează | Prioritate |
| --- | --- | --- |
| **Rezultatul acțiunilor în UI** (kick reușit/eșuat) | Apeși „Scoate" dar nu vezi dacă botul chiar a scos persoana (rezultatul stă doar în `bot_actions`/loguri). | 🔴 mare |
| **Jurnal de activitate** în dashboard (cine, ce, când) | Voturile și acțiunile de admin (legări, scoateri) sunt doar în logurile tehnice Railway. Un admin non-tehnic n-are un „istoric" vizibil. | 🟠 medie |
| **Istoric prezențe per membru** (rată %, tendință) | Acum ai „câte prezențe" și „ultima", dar nu evoluția în timp sau rata de participare — util pentru decizii (cine merită scos, cine e constant). | 🟠 medie |
| **Export CSV** al prezențelor | Pentru evidență/arhivă, în afara aplicației. | 🟢 mică |
| **Nume „fără răspuns" în Telegram** (nu doar număr) | Alegere de design; e disponibil deja în dashboard. Doar dacă vrei presiune socială în grup. | 🟢 opțional |

---

## 4. Monitorizare (știm că merge, ne anunță când nu)

| Lipsă | De ce contează | Prioritate |
| --- | --- | --- |
| **Alertă la eșec** (sondaj nepostat, scriere DB eșuată, kick eșuat) | Acum, dacă ceva pică, afli doar dacă te uiți în logurile Railway. Botul ar trebui să-ți trimită un DM „⚠️ sondajul de azi n-a plecat, motiv: …". | 🔴 mare |
| **Status bot clar în dashboard** (viu? ultimul sondaj trimis? erori recente?) | Ai un semn parțial (status deploy Railway), dar nu un „bot activ · ultimul sondaj: azi 12:39 · fără erori" pe înțelesul unui admin. | 🟠 medie |
| **Confirmare livrare sondaj** în UI | `poll_message_id` există, dar nu apare ca „sondaj trimis ✓ la ora X" în dashboard. | 🟢 mică |

---

## 5. Igienă & securitate

- **Rotire secrete** — tokenul de bot și cheia Supabase au trecut prin chat în timpul setup-ului; ar fi bine rotite (BotFather revoke + cheie nouă Supabase). Rămas de făcut.
- **Auto-crearea adaugă pe oricine apasă** — ok pentru un grup privat de sală, dar merită o „revizuire periodică" a membrilor (duplicate, non-clienți).
- **GitHub→Vercel** — webhook-ul de deploy e capricios; de reconectat integrarea ca push-urile să publice sigur.

---

## 6. Recomandare — ordinea în care aș construi

1. **„Trimite sondaj acum"** (buton în dashboard → comandă → bot postează imediat). Rezolvă cea mai mare frustrare curentă.
2. **Alerte la eșec + status bot clar** — inima monitorizării: să nu mai „tăcem" când ceva pică.
3. **Rezultatul acțiunilor (kick) + jurnal de activitate** în UI — inima transparenței.
4. **Editare sondaj/oră/locație + anulare sesiune** — control fin al antrenamentelor.
5. **Îmbinare duplicate + export CSV** — curățenie și evidență.
6. **Rotire secrete** — igienă de securitate.

Primele trei transformă botul dintr-un „poster de sondaje" într-un **instrument de administrare cu transparență și monitorizare reală**.
