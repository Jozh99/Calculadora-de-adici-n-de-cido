"use strict";

const factors = Object.freeze({
  lactico: 0.1000,
  acetico: 0.0667,
  "citrico-anhidro": 0.0711,
  "citrico-monohidratado": 0.0778
});

const quantityUnits = {
  L: { base: "L", multiplier: 1 },
  mL: { base: "L", multiplier: 0.001 },
  kg: { base: "kg", multiplier: 1 },
  g: { base: "kg", multiplier: 0.001 },
  mg: { base: "kg", multiplier: 0.000001 }
};

const metricFields = {
  initial: ["Acidez inicial", "pH inicial"],
  target: ["Acidez objetivo", "pH objetivo"]
};

const byId = (id) => document.getElementById(id);
const form = byId("calculator-form");
const acid = byId("acid");
const modePh = byId("mode-ph");
const phFactor = byId("ph-factor");
const batchUnit = byId("batch-unit");
const pilotUnit = byId("pilot-unit");
const pilotSection = byId("pilot");
const usePilot = byId("use-pilot");
const pilotFields = byId("pilot-fields");
const pilotStatus = byId("pilot-status");
const formError = byId("form-error");
const resultMass = byId("result-mass");
const massValue = byId("mass-value");
const resultMode = byId("result-mode");
const resultMessage = byId("result-message");
const resultDelta = byId("result-delta");
const resultFactor = byId("result-factor");
const resultWork = byId("result-work");
const placeholder = "—";
const errors = new Map();

const gramsFormat = new Intl.NumberFormat("es", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4
});
const deltaFormat = new Intl.NumberFormat("es", { maximumFractionDigits: 4 });
const factorFormat = new Intl.NumberFormat("es", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 6
});
const scientificFormat = new Intl.NumberFormat("es", {
  notation: "scientific",
  maximumFractionDigits: 4
});

function formatValue(value, formatter) {
  return (value >= 1e9 || (value > 0 && value < 0.0001) ? scientificFormat : formatter).format(value);
}

function showError(field, message) {
  const description = field.getAttribute("aria-describedby");
  const error = document.createElement("span");
  error.className = "field-error";
  error.id = `${field.id}-error`;
  error.textContent = message;
  field.closest(".field").append(error);
  field.setAttribute("aria-invalid", "true");
  field.setAttribute("aria-describedby", description ? `${description} ${error.id}` : error.id);
  errors.set(field, { error, description });
}

function clearErrors() {
  for (const [field, { error, description }] of errors) {
    field.removeAttribute("aria-invalid");
    if (description) {
      field.setAttribute("aria-describedby", description);
    } else {
      field.removeAttribute("aria-describedby");
    }
    error.remove();
  }
  errors.clear();
  formError.hidden = true;
  formError.textContent = "";
}

function readDecimal(id, { positive = false, percent = false, ph = false } = {}) {
  const field = byId(id);
  const raw = field.value.trim();
  if (raw === "") {
    showError(field, "Completa este campo.");
    return null;
  }

  const valid = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(raw);
  const value = valid ? Number(raw.replace(",", ".")) : NaN;
  if (!Number.isFinite(value) || (value === 0 && /[1-9]/.test(raw))) {
    showError(field, "Escribe un número válido de 0 o más.");
    return null;
  }
  if (percent && (value <= 0 || value > 100)) {
    showError(field, "Ingresa un porcentaje mayor que 0 y hasta 100.");
    return null;
  }
  if (ph && value > 14) {
    showError(field, "Ingresa un pH entre 0 y 14.");
    return null;
  }
  if (positive && value <= 0) {
    showError(field, "Ingresa un valor mayor que 0.");
    return null;
  }
  return value;
}

function clearResult() {
  if (massValue.textContent !== placeholder) {
    massValue.textContent = placeholder;
  }
  resultMass.classList.remove("mass-long");
  resultMode.hidden = true;
  resultMessage.textContent = "Completa los datos del lote para obtener la dosis.";
  resultDelta.textContent = placeholder;
  resultFactor.textContent = placeholder;
  resultWork.hidden = true;
}

function usesPilot() {
  return !modePh.checked && usePilot.checked;
}

function needsDensity() {
  return quantityUnits[batchUnit.value].base === "kg" ||
    (usesPilot() && quantityUnits[pilotUnit.value].base === "kg");
}

function setFieldVisibility() {
  pilotFields.hidden = !usesPilot();
  pilotFields.disabled = !usesPilot();
  byId("density-field").hidden = !needsDensity();
  byId("density").disabled = !needsDensity();
}

function updateMode() {
  const ph = modePh.checked;
  for (const [id, [dornicLabel, phLabel]] of Object.entries(metricFields)) {
    const label = form.querySelector(`[data-metric-label="${id}"]`);
    label.firstChild.textContent = ph ? phLabel : dornicLabel;
    label.lastElementChild.hidden = ph;
  }
  form.querySelectorAll("[data-metric-unit]").forEach((unit) => { unit.textContent = ph ? "pH" : "°D"; });
  pilotSection.hidden = ph;
  usePilot.disabled = ph;
  byId("ph-factor-field").hidden = !ph;
  phFactor.disabled = !ph;
  byId("delta-label").textContent = ph ? "Bajada de pH" : "Aumento de acidez";
  byId("notice-copy").textContent = ph
    ? "El cálculo por pH es una estimación con el factor ingresado. Confirma el pH con un equipo calibrado después de mezclar y estabilizar la lectura."
    : "El cálculo con los factores de referencia es teórico. Haz una prueba piloto y confirma la acidez por titulación con el mismo método antes y después de agregar el ácido.";
  byId("method-dornic").hidden = ph;
  byId("method-ph").hidden = !ph;
  setFieldVisibility();
  clearResult();
}

function resetPilot() {
  const pilotInputs = [...pilotFields.querySelectorAll("input")];
  const hadMeasurements = usePilot.checked || pilotInputs.some((field) => field.value !== "");
  usePilot.checked = false;
  pilotInputs.forEach((field) => { field.value = ""; });
  pilotUnit.value = "L";
  return hadMeasurements;
}

function readPilot() {
  const quantity = readDecimal("pilot-volume", { positive: true });
  const initial = readDecimal("pilot-initial");
  const final = readDecimal("pilot-final");
  const mass = readDecimal("pilot-mass", { positive: true });
  const purity = readDecimal("pilot-purity", { percent: true });
  const delta = final - initial;
  if (initial !== null && final !== null && delta <= 0) {
    showError(byId("pilot-final"), "La acidez medida debe ser mayor que la inicial.");
  }
  return { quantity, delta, mass, purity, unit: pilotUnit.value };
}

function toLiters(quantity, unit, density) {
  const { base, multiplier } = quantityUnits[unit];
  const converted = quantity * multiplier;
  return base === "L" ? converted : converted / density;
}

function number(value) {
  return formatValue(value, deltaFormat);
}

function quantityText(quantity, unit, liters) {
  const entered = `${number(quantity)} ${unit}`;
  return unit === "L" ? entered : `${entered} equivalen a ${number(liters)} L`;
}

function renderResult({ mass, delta, mode, detail, steps }) {
  const massText = formatValue(mass, gramsFormat);
  massValue.textContent = massText;
  resultMass.classList.toggle("mass-long", massText.length > 9);
  resultMode.textContent = mode;
  resultMode.hidden = false;
  resultDelta.textContent = modePh.checked ? number(delta) : `${number(delta)} °D`;
  resultFactor.textContent = detail;
  resultMessage.textContent = delta === 0
    ? "La medición objetivo ya coincide con la inicial."
    : `De producto comercial · ${acid.selectedOptions[0].textContent.toLowerCase()}`;
  byId("worked-steps").replaceChildren(...steps.map((step) => {
    const element = document.createElement("li");
    element.textContent = step;
    return element;
  }));
  resultWork.hidden = false;
  byId("result-main").scrollIntoView({ block: "nearest" });
}

function showValidationErrors() {
  if ([...errors.keys()].some((field) => pilotFields.contains(field))) {
    pilotSection.open = true;
  }
  formError.textContent = "Revisa los campos indicados para calcular la dosis.";
  formError.hidden = false;
  errors.keys().next().value.focus();
}

function estimateDose(lot, pilot, referenceFactor, quantityStep) {
  const ph = modePh.checked;
  const factor = pilot ? (pilot.mass * (pilot.purity / 100)) / (pilot.normalized * pilot.delta) : referenceFactor;
  const mass = lot.normalized * lot.delta * factor / (lot.purity / 100);
  const factorUnit = ph ? "g/L/pH" : "g/L/°D";
  const factorText = `${formatValue(factor, factorFormat)} ${factorUnit}`;
  const changeStep = ph
    ? `Bajada deseada. ${number(lot.initial)} − ${number(lot.target)} = ${number(lot.delta)} unidades de pH.`
    : `Aumento deseado. ${number(lot.target)} − ${number(lot.initial)} = ${number(lot.delta)} °D.`;
  let factorStep = `Factor teórico del ácido seleccionado. ${factorText}.`;
  if (ph) {
    factorStep = `Factor de pH ingresado. ${factorText}.`;
  } else if (pilot) {
    factorStep = `Factor del piloto. (${number(pilot.mass)} g × ${number(pilot.purity)} ÷ 100) ÷ (${number(pilot.normalized)} L × ${number(pilot.delta)} °D) ≈ ${factorText}.`;
  }
  return {
    mass,
    delta: lot.delta,
    mode: ph ? "Factor de pH" : (pilot ? "Factor piloto" : "Factor teórico"),
    detail: factorText,
    steps: [
      quantityStep,
      changeStep,
      factorStep,
      `Dosis comercial. ${number(lot.normalized)} L × ${number(lot.delta)} ${ph ? "pH" : "°D"} × ${factorText} ÷ (${number(lot.purity)} ÷ 100) ≈ ${formatValue(mass, gramsFormat)} g.`
    ]
  };
}

form.addEventListener("input", () => {
  byId("clear-status").textContent = "";
  clearErrors();
  clearResult();
  setFieldVisibility();
});

form.addEventListener("change", (event) => {
  if (event.target.name === "mode") {
    byId("initial").value = "";
    byId("target").value = "";
    phFactor.value = "";
    resetPilot();
    pilotStatus.textContent = "";
    pilotSection.open = false;
    updateMode();
  }
});

acid.addEventListener("change", () => {
  phFactor.value = "";
  if (resetPilot()) {
    pilotStatus.textContent = "Cambió el ácido. Ingresa las mediciones del piloto para el nuevo ácido.";
  }
  setFieldVisibility();
});

usePilot.addEventListener("change", () => {
  pilotStatus.textContent = "";
  setFieldVisibility();
});

byId("clear-form").addEventListener("click", () => {
  const keepPh = modePh.checked;
  form.reset();
  if (keepPh) {
    modePh.checked = true;
  }
  pilotSection.open = false;
  pilotStatus.textContent = "";
  resultWork.open = false;
  byId("worked-steps").replaceChildren();
  clearErrors();
  updateMode();
  byId("volume").focus();
  byId("clear-status").textContent = "Se borraron los datos y el resultado.";
});

updateMode();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();
  clearResult();

  const ph = modePh.checked;
  const quantity = readDecimal("volume", { positive: true });
  const initial = readDecimal("initial", { ph });
  const target = readDecimal("target", { ph });
  const purity = readDecimal("purity", { percent: true });
  const referenceFactor = factors[acid.value];

  if (!Number.isFinite(referenceFactor)) {
    showError(acid, "Selecciona un tipo de ácido.");
  }
  const hasMeasurements = initial !== null && target !== null;
  const delta = ph ? initial - target : target - initial;
  if (hasMeasurements && delta < 0) {
    showError(byId("target"), ph
      ? "Agregar ácido baja el pH. Usa un objetivo igual o menor que el pH inicial."
      : "Agregar ácido solo permite aumentar los °D. Usa un objetivo igual o mayor que la acidez inicial.");
  }

  if (hasMeasurements && delta === 0) {
    if (errors.size > 0) {
      showValidationErrors();
      return;
    }
    renderResult({ mass: 0, delta, mode: "Sin adición", detail: placeholder, steps: ["La medición inicial coincide con el objetivo. La dosis es 0 g."] });
    return;
  }

  const factor = ph ? readDecimal("ph-factor", { positive: true }) : referenceFactor;
  const pilot = usesPilot() ? readPilot() : null;
  const density = needsDensity() ? readDecimal("density", { positive: true }) : null;
  if (errors.size > 0) {
    showValidationErrors();
    return;
  }

  const normalized = toLiters(quantity, batchUnit.value, density);
  const lot = { normalized, initial, target, delta, purity };
  const quantities = [normalized];
  let quantityStep = `Cantidad del lote. ${quantityText(quantity, batchUnit.value, normalized)}.`;
  if (pilot) {
    pilot.normalized = toLiters(pilot.quantity, pilot.unit, density);
    quantities.push(pilot.normalized);
    quantityStep += ` Cantidad del piloto. ${quantityText(pilot.quantity, pilot.unit, pilot.normalized)}.`;
  }
  if (density !== null) {
    quantityStep += ` Para pasar de kg a L, se divide entre ${number(density)} kg/L.`;
  }

  const result = estimateDose(lot, pilot, factor, quantityStep);
  if (![...quantities, result.mass].every((value) => Number.isFinite(value) && value > 0)) {
    formError.textContent = "El cálculo queda fuera del rango numérico. Revisa la escala y las unidades de los datos.";
    formError.hidden = false;
    return;
  }

  renderResult(result);
});
