// ECC programme courses — AHS Curricula (Jan 2021), pages 13–14.
// level = year (2–4), term 1 = fall, 2 = spring, 0 = elective. cr = credit hours; l / lab / fh = contact hours.
export const CATALOG = [
  {"code": "ECC211", "name": "Foundation of the Emergency Medicine", "level": 2, "term": 1, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC212", "name": "Foundation of Critical Care Medicine", "level": 2, "term": 1, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC213", "name": "Emergency in Medicine 1", "level": 2, "term": 1, "elective": false, "cr": 3, "l": 1, "lab": 0, "fh": 8},
  {"code": "ECC214", "name": "Pathology for Health Science Technologists", "level": 2, "term": 1, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC221", "name": "Respiratory Emergencies", "level": 2, "term": 2, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC222", "name": "Environmental Hygiene and Safety", "level": 2, "term": 2, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC223", "name": "Emergency in Medicine 2", "level": 2, "term": 2, "elective": false, "cr": 3, "l": 1, "lab": 2, "fh": 4},
  {"code": "ECC224", "name": "Trauma Systems / Mechanism of Injury", "level": 2, "term": 2, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC311", "name": "Airway Management & Ventilation", "level": 3, "term": 1, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC312", "name": "Emergency Practice 1", "level": 3, "term": 1, "elective": false, "cr": 4, "l": 2, "lab": 0, "fh": 8},
  {"code": "ECC313", "name": "Infection Control", "level": 3, "term": 1, "elective": false, "cr": 3, "l": 1, "lab": 2, "fh": 4},
  {"code": "ECC314", "name": "Intensive Care Practice 1", "level": 3, "term": 1, "elective": false, "cr": 4, "l": 2, "lab": 0, "fh": 8},
  {"code": "ECC321", "name": "Cardiac and Diabetic Emergencies", "level": 3, "term": 2, "elective": false, "cr": 3, "l": 1, "lab": 0, "fh": 8},
  {"code": "ECC322", "name": "Patient Monitoring and Assessments 1", "level": 3, "term": 2, "elective": false, "cr": 3, "l": 2, "lab": 0, "fh": 4},
  {"code": "ECC323", "name": "Emergency Practice 2", "level": 3, "term": 2, "elective": false, "cr": 4, "l": 2, "lab": 0, "fh": 8},
  {"code": "ECC324", "name": "Patient Monitoring and Assessments 2", "level": 3, "term": 2, "elective": false, "cr": 3, "l": 1, "lab": 2, "fh": 4},
  {"code": "ECC411", "name": "Intensive Care Practice 2", "level": 4, "term": 1, "elective": false, "cr": 4, "l": 2, "lab": 0, "fh": 8},
  {"code": "ECC412", "name": "Emergency Pharmacology", "level": 4, "term": 1, "elective": false, "cr": 3, "l": 3, "lab": 0, "fh": 0},
  {"code": "ECC413", "name": "Special Considerations in Emergencies & Critical Care", "level": 4, "term": 1, "elective": false, "cr": 3, "l": 1, "lab": 0, "fh": 8},
  {"code": "ECC414", "name": "Medication Administration", "level": 4, "term": 1, "elective": false, "cr": 2, "l": 2, "lab": 0, "fh": 0},
  {"code": "ECC421", "name": "Emergency Practice 3", "level": 4, "term": 2, "elective": false, "cr": 4, "l": 1, "lab": 2, "fh": 8},
  {"code": "ECC422", "name": "Intensive Care Practice 3", "level": 4, "term": 2, "elective": false, "cr": 3, "l": 1, "lab": 0, "fh": 8},
  {"code": "ECC423", "name": "Graduation Project", "level": 4, "term": 2, "elective": false, "cr": 4, "l": 1, "lab": 2, "fh": 8},
  {"code": "ECC424", "name": "Clinical Anesthesia", "level": 4, "term": 2, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC425", "name": "Anesthesia Equipment", "level": 4, "term": 2, "elective": false, "cr": 2, "l": 2, "lab": 0, "fh": 0},
  {"code": "ECC311E", "name": "Directed Studies in Intensive Care", "level": 3, "term": 0, "elective": true, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC312E", "name": "Principles of Health Care Management System", "level": 3, "term": 0, "elective": true, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC313E", "name": "Ethics and Human Rights", "level": 3, "term": 0, "elective": true, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC314E", "name": "Development and Regulation of Medical Product", "level": 3, "term": 0, "elective": true, "cr": 3, "l": 3, "lab": 0, "fh": 0},
  {"code": "ECC411E", "name": "Quality Systems and Standards in Critical Care", "level": 4, "term": 0, "elective": true, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC412E", "name": "Hemorrhage and Shock", "level": 4, "term": 0, "elective": true, "cr": 3, "l": 2, "lab": 2, "fh": 0}
];

export const LEVELS = [2, 3, 4];
export const byCode = code => CATALOG.find(c => c.code === code);
