-- ============================================================
-- Reglamento Loiu 500 Trail 2026 (1 nov 2026) — BILINGÜE eus/es
-- Volcado del documento oficial "REGLAMENTO – ARAUDIA".
-- ============================================================
-- Sentencias independientes e idempotentes: se pueden ejecutar varias
-- veces sin duplicar, y no dependen de un bloque DO (que el editor
-- de Lovable trocea si es muy largo). Cada seccion se salta si ya
-- existe una con ese mismo section_order.
-- Publicado = false: revisa y publica desde el admin.

-- 1) Asegura el reglamento de la carrera
insert into race_regulations (race_id, published, version)
select 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a', false, 1
where not exists (
  select 1 from race_regulations
  where race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
);

-- 2) Secciones (euskera + castellano en cada una)

insert into race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required)
select r.id, 'general_info', 'Información General / Informazio Orokorra',
E'Loiuko Udalak, hainbat enpresaren lankidetzarekin, Loiu 500 Trail kirol probaren hirugarren edizioa antolatzen du.\n\nProba azaroaren 1ean egingo da oinez eta korrika modalitateetan, 12.000 metroko zirkuitu batean. Zailtasuna ertaina da, 290 metroko altuera maximoa, eta 339 metrokoa, biak aldapa positiboa zein negatiboa.\n\nProba egiteko gehienezko denbora BI ORDU ETA ERDI KORRIKA modalitatean eta HIRU ORDU ETA ERDI IBILTZEN moduan ezartzen da.\n\nIBILTZEN modalitatea ez da lehiakorra; beraz, jendeak ibiltzeko izena emanez gero, nahi duen erritmoan ibili beharko du baina korrika egin gabe (kasu horretan korrika egiteko modalitatean izena eman behar baitu). Gogoratu ez dela lehiakorra, sailkapena zenbakiarekin eta txiparekin egiten bada ere.\n\n──────────\n\nEl Ayuntamiento de Loiu, con la colaboración de diversas empresas, organiza la tercera edición del evento deportivo Loiu 500 Trail.\n\nLa prueba se celebrará el 1 de noviembre en las modalidades de ANDAR y CORRER, sobre un circuito de 12.000 metros de recorrido. La dificultad es moderada, con una altitud máxima de 290 metros y un desnivel de 339 metros, tanto positivo como negativo.\n\nTiempo máximo para la realización de la prueba:\n• Modalidad CORRER: DOS HORAS Y MEDIA.\n• Modalidad ANDAR: TRES HORAS Y MEDIA.\n\nLa modalidad de ANDAR no es competitiva: quienes se apunten a andar deben hacerlo al ritmo que deseen pero sin correr (en cuyo caso deben apuntarse a la modalidad de correr). Aunque no es competitiva, se realiza la clasificación con el dorsal y el chip.',
1, true
from race_regulations r
where r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
and not exists (select 1 from race_regulation_sections s where s.regulation_id = r.id and s.section_order = 1);

insert into race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required)
select r.id, 'classifications', 'Modalidad de Correr y Premios / Korrika Modalitatea eta Sariak',
E'KORRIKA modalitatea lehiakorra da eta hainbat opari emango zaizkie sailkapen absolutuko lehen hamar eta hamar onenei. Inola ere ez da dirusaririk izango. Opariak, lehen 10ei, iristen diren heinean entregatuko zaizkie, alferrikako hozteak eragiten dituzten itxaronaldiak saihesteko. Podiumetako argazkiak ateratzen saiatuko dira, gutxienez.\n\n──────────\n\nLa modalidad de CORRER es competitiva y se premiará con diversos regalos a los diez primeros y diez primeras de las clasificaciones absolutas. En ningún caso existirán premios en metálico. Los regalos a los 10 primeros/as se entregarán según vayan llegando, a fin de evitar esperas que propicien enfriamientos innecesarios. Se tratará de hacer, como mínimo, las fotos de los podios.',
2, false
from race_regulations r
where r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
and not exists (select 1 from race_regulation_sections s where s.regulation_id = r.id and s.section_order = 2);

insert into race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required)
select r.id, 'registration', 'Inscripción / Izen-ematea',
E'Izen-emateak www.rockthesport.com eta www.uno.es plataformen bidez egin daitezke.\n\nIzen-ematearen prezioa: 12 eurokoa ekainean eta uztailean; 13 eurokoa abuztuan; 14 eurokoa irailean; 15 eurokoa urrian. Barne hartzen ditu:\n• Erakundearen Erantzukizun Zibileko Asegurua.\n• Istripu-asegurua.\n• Dortsal-zenbakia.\n• Txipa.\n• Kamiseta ofiziala.\n• Bi modalitateetako opari-zozketa, iristean egiazta daitekeena, dagokion zenbakiarekin.\n• Lasterketako hornigaia.\n• Helmugako hornigaia.\n• Helmugako txoripana.\n• Aldagela.\n• Jantziak gordetzeko lekua.\n• Ibiltzeko zein korrika egiteko berehalako sailkapenak www.uno.es webgunean.\n• Lasterketaren argazkiak eta bideoak Facebooken, Loiu 500 Trail orrialdean.\n\nBai oinez bai korrika modalitatean, lasterketako dortsal ofiziala dagokion txiparekin eraman beharko da; horiek zehaztuko dute ordu ofiziala eta etorkizuneko parte-hartzeetarako erreferentziak.\n\n──────────\n\nLas inscripciones se podrán realizar a través de www.rockthesport.com y www.uno.es.\n\nPrecio de la inscripción: 12 € en junio y julio; 13 € en agosto; 14 € en septiembre; 15 € en octubre. Incluye:\n• Seguro de Responsabilidad Civil de la Organización.\n• Seguro de Accidentes.\n• Dorsal.\n• Chip.\n• Camiseta oficial.\n• Sorteo de regalos en ambas modalidades, que se podrá comprobar en la llegada con el dorsal correspondiente.\n• Avituallamiento de carrera.\n• Avituallamiento de llegada.\n• Txoripan de llegada.\n• Vestuario.\n• Guardarropa.\n• Clasificaciones instantáneas, tanto de andar como de correr, en www.uno.es.\n• Fotografías y vídeos de la prueba en Facebook, página Loiu 500 Trail.\n\nTanto en la modalidad de andar como en la de correr se deberá portar el dorsal oficial de la prueba con su chip correspondiente, que determinarán el tiempo oficial y las referencias para futuras ocasiones en las que se participe.',
3, true
from race_regulations r
where r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
and not exists (select 1 from race_regulation_sections s where s.regulation_id = r.id and s.section_order = 3);

insert into race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required)
select r.id, 'registration', 'Inscripciones Gratuitas (Empadronados en Loiu) / Doako Izen-emateak (Loiun Erroldatuak)',
E'Loiuko Udalaren babesari esker, udalerrian erroldatutako pertsonentzat 100 doako izen-emate erreserbatzen dira, lehenengo ehun pertsonentzat, izena emateko ordena zorrotzari jarraituz. Plataformen bidez ohiko moduan izena eman, matrikula ordaindu (Loiu biztanle gisa adieraziz) eta, proba egunean parte-hartzea/asistentzia egiaztatu ondoren, errolda-agiriaren kopia edo antzeko dokumentua bidali beharko dute; zenbatekoa Loiu 500 Trailaren ondorengo astean itzuliko da. 100 laguneko kupora iristean, bi plataformetako BERRIAK atalean oharaz jakinaraziko da, eta itxaron-zerrenda bat sortuko da norbait agertzen ez bada. 100 doako dortsalen kupoa bi modalitateen artean banatzen da (12 km-ko martxa eta martxa txikia): 50 eta 50, 40 eta 60... beti ere ordena kronologikoaren arabera (eguna eta ordua).\n\n──────────\n\nEl patrocinio del Ayuntamiento de Loiu propicia la reserva de 100 inscripciones gratuitas para las personas empadronadas en el municipio, para las cien primeras por riguroso orden de inscripción. Deberán inscribirse por las plataformas de manera normal, pagar el importe de la inscripción (señalando como población Loiu) y, una vez corroborada su participación/asistencia el día de la prueba, remitir copia del empadronamiento o documento similar; la devolución del importe se realizará en la semana posterior a la Loiu 500 Trail. Se avisará al alcanzar el cupo de 100 personas con una nota en la sección de NOTICIAS de las dos plataformas, y se creará una lista de espera por si alguien no se presentara. El cupo de 100 dorsales gratuitos se reparte entre las dos modalidades (marcha de 12 km y marcha txiki): pueden ser 50 y 50, 40 y 60, etc., siempre según el orden cronológico de inscripción (día y hora).',
4, false
from race_regulations r
where r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
and not exists (select 1 from race_regulation_sections s where s.regulation_id = r.id and s.section_order = 4);

insert into race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required)
select r.id, 'bib_collection', 'Recogida de Dorsales y Chips / Dortsalak eta Txipak Jasotzea',
E'Izen-emateak urriaren 29ra arte egin daitezke, online plataformen bidez. Urriaren 29an eta 30ean, kamiseta, dortsala eta denbora-txipa pertsonalki jaso daitezke edo norbait bidali Decathlon Bilbaora (Villerías 10), izen-emate bulegoa egongo den tokira. Jasotze-ordutegia: 10:00etatik 14:00etara eta 16:00etatik 20:00etara. Urriaren 31n, larunbatean, lasterketaren bezperan, ez da dortsalik banatuko.\n\nLoiu 500 Trail egunean, azaroaren 1ean, dortsalak eta txipak oinezko modalitatearen irteera baino ordu erdi lehenago jaso ahal izango dira (9:30ean). Izen-emate bulegoa irteera/helmuga gunean egongo da, Erretiratuen Plazan. Atzerapenak eta ilarak saihesteko, gomendatzen da aurreko astean jasotzea edo norbait bidaltzea.\n\n──────────\n\nLas inscripciones se podrán realizar hasta el 29 de octubre a través de las plataformas. Los días 29 y 30 de octubre se podrán recoger la camiseta, el dorsal y el chip de manera personal, o enviando a alguien, en Decathlon Bilbao (calle Villerías 10), donde estará instalada la secretaría. Horario de recogida: de 10:00 a 14:00 y de 16:00 a 20:00 h. El sábado 31 de octubre, víspera de la prueba, no se entregarán dorsales.\n\nEl día de la prueba (1 de noviembre) se podrán recoger dorsales y chip hasta media hora antes de la salida de la modalidad de andar (prevista a las 9:30 h). La secretaría estará instalada en la zona de salida y llegada, en la Plaza de los Jubilados. Se aconseja retirar durante la semana previa, o enviar a alguien a recogerlo, para evitar retrasos y colas innecesarias.',
5, false
from race_regulations r
where r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
and not exists (select 1 from race_regulation_sections s where s.regulation_id = r.id and s.section_order = 5);

insert into race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required)
select r.id, 'cutoff_times', 'Horarios de Salida / Irteera Orduak',
E'Irteerak (azaroaren 1ean):\n• 9:30 — Korrika: 12 km.\n• 9:40 — Ibili: 12 km.\n• 9:45 — Martxa Txiki: 5 km.\n\n──────────\n\nSalidas (1 de noviembre):\n• 9:30 h — Korrika / Correr: 12 km.\n• 9:40 h — Ibili / Andar: 12 km.\n• 9:45 h — Martxa Txiki: 5 km.',
6, true
from race_regulations r
where r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
and not exists (select 1 from race_regulation_sections s where s.regulation_id = r.id and s.section_order = 6);

insert into race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required)
select r.id, 'txiki_march', 'Marcha Txiki (5 km) / Martxa Txikia (5 km)',
E'Loiu 500 Trailak, 12 kilometroko probaz gain, 5 kilometroko martxa txiki bat hartuko du, oinezko modalitaterako soilik, eta haur, lagun eta 12 kilometro egiteko gaitasun fisiko txikiagoa duten pertsonentzat. Irteera eta helmuga, 12 kilometroko martxarena bezala, Erretiratuen Plazan egongo dira. Izen-emateak www.rockthesport.com eta www.uno.es plataformen bidez egin daitezke. Prezioa: irailaren 30era arte, 8 €; urriaren 1etik aurrera (dortsalik eta txiprik geratzen bada), 10 €. Izen-ematearen prezioak 12 kilometroko probaren izen-emate atalean ezarritako eskubide berberak barne hartzen ditu, korrika egiteko modalitatea izan ezik, martxa txikian existitzen ez dena.\n\n──────────\n\nLa Loiu 500 Trail, además de la prueba de 12 kilómetros, acogerá una marcha txiki de 5 kilómetros de recorrido, exclusivamente para la modalidad de andar y destinada a niños, acompañantes y otras personas con menor capacidad física para realizar los 12 kilómetros. La salida y la llegada, al igual que la marcha de 12 kilómetros, estarán instaladas en la Plaza de los Jubilados. Las inscripciones se podrán realizar a través de www.rockthesport.com y www.uno.es. Precio: hasta el 30 de septiembre, 8 €; a partir del 1 de octubre (si quedaran dorsales y chip), 10 €. El precio incluye los mismos derechos que el apartado de Inscripción de la prueba de 12 kilómetros, salvo la modalidad de correr, que no existe en la marcha txiki.',
7, false
from race_regulations r
where r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
and not exists (select 1 from race_regulation_sections s where s.regulation_id = r.id and s.section_order = 7);

insert into race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required)
select r.id, 'shirt_sizes', 'Tallas de Camiseta / Kamiseta Neurriak',
E'Antolatzaileek ezin dituzte kamiseta-neurriak bermatu ekitaldiaren egunetik hurbil egindako izen-emateetarako.\n\n──────────\n\nLa organización no garantiza las tallas de camisetas para las inscripciones que se realicen más tarde, cercanas al día de la prueba.',
8, false
from race_regulations r
where r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
and not exists (select 1 from race_regulation_sections s where s.regulation_id = r.id and s.section_order = 8);

insert into race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required)
select r.id, 'responsibility', 'Responsabilidad y Participación / Erantzukizuna eta Parte-hartzea',
E'Dortsal-zenbakirik gabe parte hartzen saiatzen diren pertsonak antolakuntzako langileek erretira ditzakete; eta dortsal ofiziala duen parte-hartzaile bati ezbeharren bat eragiten badiote, delitua izan daiteke.\n\nParte-hartzaileek uste dute proba egiteko gutxieneko baldintza fisikoetan daudela. Antolakuntzak ez du erantzukizunik izango aldez aurretik arazo fisikoak dituzten eta beren gaitzak edo lesioak larriagotzeko arriskua hartzen duten pertsonen lesioen gainean.\n\nAntolakuntzak eskubidea du araudi hau aldatzeko edozein behar logistiko, juridiko eta sanitarioren arabera.\n\n──────────\n\nLas personas que traten de participar sin dorsal podrán ser retiradas por el personal de la organización; y si causaran algún percance a algún participante con dorsal oficial, puede ser constitutivo de delito.\n\nLos y las participantes asumen que están en las condiciones físicas mínimas para realizar la prueba. La organización no se hará responsable de las lesiones de aquellas personas que participen con problemas físicos previos y se arriesguen a agravar sus dolencias o lesiones.\n\nLa organización se reserva el derecho de modificar el presente reglamento en función de cualquier necesidad logística, jurídica y de salud.',
9, true
from race_regulations r
where r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
and not exists (select 1 from race_regulation_sections s where s.regulation_id = r.id and s.section_order = 9);

insert into race_regulation_sections (regulation_id, section_type, title, content, section_order, is_required)
select r.id, 'data_protection', 'Fotografías y Derechos de Imagen / Argazkiak eta Irudi-eskubideak',
E'Parte-hartzaileen argazkiak, Loiu 500 Trail orrialdean Facebooken argitaratzeaz eta doan deskargatzeko eskaintzeaz gain, hurrengo edizioetako iragarki-kartelak egiteko erabil daitezke. Norbaitek argitalpenik nahi ez badu, idatziz adierazi beharko dio antolakuntzari.\n\n──────────\n\nLas fotografías de los participantes, además de ser publicadas en Facebook (página Loiu 500 Trail) para que se puedan descargar de manera gratuita, podrán ser utilizadas para realizar carteles publicitarios en ediciones futuras. Si alguien no desea alguna de estas publicaciones, deberá manifestarlo por escrito a la organización.',
10, true
from race_regulations r
where r.race_id = 'f5f7ed25-dc74-4a2d-8be9-5f6fb023307a'
and not exists (select 1 from race_regulation_sections s where s.regulation_id = r.id and s.section_order = 10);
