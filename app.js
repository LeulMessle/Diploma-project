let symptoms = [];
let interviewId = null;
let _lastResult = null; // store latest result for download

const TRIAGE_MAP = {
  emergency_ambulance: "Emergency",
  emergency: "Emergency",
  consultation_24: "Non-emergency care",
  consultation: "Non-emergency care",
  self_care: "Self-care"
};

function emergencyBanner() {
  return `<div id="triage-banner" class="error-message" style="display:block">
    This may be an emergency. Go to the nearest emergency department or call local emergency services now.
  </div>`;
}

function generateInterviewId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random()*16|0, v = c=='x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  interviewId = generateInterviewId();
  document.getElementById('addBtn').addEventListener('click', addSymptom);
  document.getElementById('diagBtn').addEventListener('click', startDiagnosis);
  document.getElementById('symptomInput').addEventListener('keypress', e => { if (e.key==='Enter') addSymptom(); });
  renderCommonSymptoms();

  // One-click JSON download of the latest results (for evaluation tables)
  const dl = document.getElementById('downloadJsonBtn');
  if (dl) dl.addEventListener('click', () => {
    if(!_lastResult) return;
    const blob = new Blob([JSON.stringify(_lastResult, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dxv2_result_${interviewId}.json`;
    a.click();
  });
});

function renderCommonSymptoms() {
  const commons = ["Headache","Fever","Cough","Fatigue","Nausea","Diarrhea","Abdominal pain","Body aches","Difficulty breathing","Rash","Vomiting","Chest pain"];
  const wrap = document.getElementById('commonSymptomButtons');
  if (!wrap) return;
  wrap.innerHTML = commons.map(s => `<div class="common-symptom" onclick="addCommonSymptom('${s.replace(/'/g,"\\'")}')">${s}</div>`).join('');
}

function addSymptom() {
  const input = document.getElementById('symptomInput');
  const symptom = input.value.trim();
  if (symptom && !symptoms.includes(symptom)) {
    symptoms.push(symptom);
    updateSymptomsList();
    input.value='';
  }
}

function addCommonSymptom(symptom) {
  if (!symptoms.includes(symptom)) {
    symptoms.push(symptom);
    updateSymptomsList();
  }
}

function removeSymptom(symptom) {
  symptoms = symptoms.filter(s => s !== symptom);
  updateSymptomsList();
}

function updateSymptomsList() {
  const list = document.getElementById('symptomsList');
  list.innerHTML = symptoms.map(symptom =>
    `<div class="symptom-tag">${symptom}<span class="remove" onclick="removeSymptom('${symptom.replace(/'/g,"\\'")}')">×</span></div>`
  ).join('');
}

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.innerHTML = message;
  errorDiv.style.display = 'block';
  errorDiv.scrollIntoView({ behavior: 'smooth' });
}

// Fallback evidence builder via /api/search
async function buildEvidenceFromSearch({ symptoms }) {
  const evidence = [];
  for (const term of symptoms) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
    if (!res.ok) continue;
    const items = await res.json();
    const hit = (items || []).find(x => x.type === 'symptom') || (items || [])[0];
    if (hit && hit.id) {
      evidence.push({ id: hit.id, choice_id: "present", source: "initial" });
    }
  }
  return evidence;
}

// Preferred evidence builder via /api/parse (if enabled)
async function buildEvidenceFromParse({ symptoms, sex, age }) {
  const text = symptoms.join(", ");
  const response = await fetch("/api/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      sex,
      age: { value: parseInt(age, 10), unit: "year" }
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Parse error: ${response.status} ${errText}`);
  }
  const parsed = await response.json();
  return (parsed.mentions || []).map(m => ({
    id: m.id,
    choice_id: m.choice_id || "present",
    source: "initial"
  }));
}

async function startDiagnosis() {
  if (symptoms.length === 0) { alert('Please add at least one symptom.'); return; }
  const gender = document.getElementById('gender').value;
  const age = document.getElementById('age').value;
  if (!gender || !age) { alert('Please provide patient gender and age.'); return; }

  document.getElementById('loading').style.display='block';
  document.getElementById('results').style.display='none';
  document.getElementById('errorMessage').style.display='none';

  try {
    // Build evidence (parse first, fallback to search if parse unavailable)
    let evidence;
    try {
      evidence = await buildEvidenceFromParse({ symptoms, sex: gender, age });
    } catch (err) {
      if (String(err.message).includes('Parse error: 405')) {
        evidence = await buildEvidenceFromSearch({ symptoms });
      } else {
        throw err;
      }
    }

    if (!evidence.length) {
      showError('No recognizable symptoms were parsed. Try more specific terms.');
      document.getElementById('loading').style.display='none';
      return;
    }

    const payload = {
      sex: gender,
      age: { value: parseInt(age, 10), unit: "year" },
      evidence
    };

    // 1) Diagnosis
    const dxRes = await fetch("/api/diagnosis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Interview-Id": interviewId
      },
      body: JSON.stringify(payload)
    });
    if (!dxRes.ok) {
      const errText = await dxRes.text();
      throw new Error(`Infermedica API error: ${dxRes.status} ${errText}`);
    }
    const diagnosis = await dxRes.json();

    // 2) Triage
    const triageRes = await fetch("/api/triage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Interview-Id": interviewId
      },
      body: JSON.stringify(payload)
    });
    if (!triageRes.ok) {
      const errText = await triageRes.text();
      throw new Error(`Infermedica triage error: ${triageRes.status} ${errText}`);
    }
    const triage = await triageRes.json();
    const vendorLevel = triage.triage_level || (triage.triage && triage.triage.level);
    const mappedLevel = TRIAGE_MAP[vendorLevel] || null;

    // Cache for download/export
    _lastResult = { interviewId, mappedLevel, vendorLevel, diagnosis };

    displayResults(diagnosis, mappedLevel);
  } catch (e) {
    console.error(e);
    showError('Error during diagnosis: ' + e.message + '. Verify backend credentials.');
  } finally {
    document.getElementById('loading').style.display='none';
  }
}

function displayResults(diagnosis, mappedLevel) {
  const resultsDiv = document.getElementById('results');
  let header = `<h3 class="section-title">Diagnosis Results</h3>`;
  if (mappedLevel === "Emergency") header = emergencyBanner() + header;

  if (!diagnosis.conditions || diagnosis.conditions.length === 0) {
    resultsDiv.innerHTML = header + `
      <div class="diagnosis-item">
        <div class="diagnosis-name">No specific conditions identified</div>
        <div class="diagnosis-description">Based on the provided symptoms, no specific medical conditions could be identified. Please consult a healthcare professional.</div>
      </div>`;
  } else {
    resultsDiv.innerHTML = `
      ${header}
      <p style="margin-bottom:20px;color:#666;">Analysis of ${symptoms.length} symptoms:</p>
      ${diagnosis.conditions.map(c => `
        <div class="diagnosis-item" data-test="condition-item">
          <div class="diagnosis-name">${c.common_name || c.name}</div>
          <div class="diagnosis-probability">${(c.probability*100).toFixed(1)}% probability</div>
          <div class="diagnosis-description">${(c.extras && c.extras.hint) ? c.extras.hint : 'Professional medical evaluation recommended.'}</div>
        </div>`).join('')}
    `;
  }
  resultsDiv.style.display='block';
  resultsDiv.scrollIntoView({ behavior: 'smooth' });
}