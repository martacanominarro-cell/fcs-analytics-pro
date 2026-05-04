let v7Files = [];
let v7Groups = [{ id: Date.now(), name: 'Sample 1', filenames: [] }];
let v7LastResults = null;

async function v7HandleFiles(input) {
    if (!input.files || input.files.length === 0) return;
    v7Files = Array.from(input.files).sort((a, b) => {
        const aNum = parseInt(a.name); const bNum = parseInt(b.name);
        return (!isNaN(aNum) && !isNaN(bNum)) ? aNum - bNum : a.name.localeCompare(b.name);
    });
    
    v7Groups = [{ id: Date.now(), name: 'Sample 1', filenames: [] }];

    document.getElementById('v7-status-area').style.display = 'block';
    document.getElementById('v7-status-text').innerText = `✅ Success: ${v7Files.length} files selected. Reading channels...`;
    
    // Fetch channels from the first file
    const formData = new FormData();
    formData.append('file', v7Files[0]);
    try {
        const response = await fetch('/get-channels', { method: 'POST', body: formData });
        const data = await response.json();
        if (data.channels && data.channels.length > 0) {
            const select = document.getElementById('v7-channel');
            select.innerHTML = data.channels.map(c => `<option value="${c}" ${c.includes('B525-H') ? 'selected' : ''}>${c}</option>`).join('');
            document.getElementById('v7-status-text').innerText = `✅ Success: ${v7Files.length} files. Found ${data.channels.length} channels.`;
        }
    } catch (e) {
        console.error("Failed to fetch channels", e);
        document.getElementById('v7-status-text').innerText = `✅ Success: ${v7Files.length} files selected.`;
    }

    document.getElementById('v7-run-section').style.display = 'block';
    v7RenderGroups();
}

function v7RenderGroups() {
    const list = document.getElementById('v7-group-list');
    if (!list) return;
    list.innerHTML = '';
    v7Groups.forEach((group, index) => {
        const card = document.createElement('div');
        card.className = 'sample-group-item';
        card.style.background = 'rgba(255,255,255,0.03)'; card.style.padding = '1.5rem';
        card.style.borderRadius = '1rem'; card.style.marginBottom = '1rem'; card.style.border = '1px solid var(--border)';
        let filesHtml = v7Files.length === 0 ? `<p style="font-size: 0.9rem; color: #64748b; margin-top: 1rem; font-style: italic;">Choose files in Step 1 first.</p>` : `
            <div class="file-checklist">
                ${v7Files.map(f => {
                    const isChecked = group.filenames.includes(f.name);
                    return `<label class="file-item"><input type="checkbox" ${isChecked ? 'checked' : ''} onchange="v7Toggle(${index}, '${f.name}')"><span>${f.name}</span></label>`;
                }).join('')}
            </div>`;
        card.innerHTML = `<div style="display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1rem;"><div style="flex-grow: 1;"><label>Group Name</label><input type="text" value="${group.name}" oninput="v7Groups[${index}].name = this.value" style="width: 100%; padding: 0.8rem; background: #0f172a; border: 1px solid var(--border); color: white; border-radius: 0.5rem;"></div><button onclick="v7RemoveGroup(${index})" style="background: var(--danger); padding: 0.8rem; width: 45px; border-radius: 0.5rem; color: white;">&times;</button></div>${filesHtml}<p style="margin-top: 1rem; font-size: 0.9rem; color: var(--accent); font-weight: 700;"><span id="v7-count-${index}">${group.filenames.length}</span> replicates selected</p>`;
        list.appendChild(card);
    });
}

function v7Toggle(groupIdx, fname) {
    const group = v7Groups[groupIdx]; const i = group.filenames.indexOf(fname);
    if (i > -1) group.filenames.splice(i, 1); else group.filenames.push(fname);
    document.getElementById(`v7-count-${groupIdx}`).innerText = group.filenames.length;
}

function v7AddGroup() { v7Groups.push({ id: Date.now(), name: `Sample ${v7Groups.length + 1}`, filenames: [] }); v7RenderGroups(); }
function v7RemoveGroup(i) { v7Groups.splice(i, 1); v7RenderGroups(); }

async function v7RunAnalysis() {
    const channel = document.getElementById('v7-channel').value;
    const mapping = {}; let total = 0;
    v7Groups.forEach(g => { if (g.filenames.length > 0) { mapping[g.name] = g.filenames; total += g.filenames.length; } });
    if (total === 0) return alert("Assign files to groups first.");
    const formData = new FormData();
    const assigned = new Set(Object.values(mapping).flat());
    const uploadSet = v7Files.filter(f => assigned.has(f.name));
    uploadSet.forEach(f => formData.append('files', f));
    formData.append('mapping', JSON.stringify(mapping)); formData.append('channel', channel);
    document.getElementById('v7-loading').style.display = 'flex';
    try {
        const response = await fetch('/analyze-upload', { method: 'POST', body: formData });
        if (!response.ok) throw new Error("Server returned " + response.status);
        v7LastResults = await response.json(); 
        v7Display(v7LastResults);
    } catch (err) { 
        alert("Analysis failed: " + err.message); 
        console.error(err); 
    }
    finally { document.getElementById('v7-loading').style.display = 'none'; }
}

function v7Display(fullData) {
    window.v7CurrentFullData = fullData;
    document.getElementById('v7-results').style.display = 'block';
    v7RenderFilters();
    v7ApplyFilters();
    document.getElementById('v7-results').scrollIntoView({ behavior: 'smooth' });
}

function v7RenderFilters() {
    const filterDiv = document.getElementById('v7-sample-filters');
    if (!filterDiv || !window.v7CurrentFullData) return;
    const results = window.v7CurrentFullData.results;
    let html = '<div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; background: white; padding: 1rem; border-radius: 0.5rem; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">';
    html += '<strong style="color: #0f172a; font-size: 16px;">Active Samples:</strong>';
    results.forEach(r => {
        html += `<label style="display: flex; align-items: center; gap: 0.25rem; font-size: 14px; cursor: pointer;"><input type="checkbox" class="v7-sample-filter-cb" value="${r.sample}" checked onchange="v7ApplyFilters()">${r.sample}</label>`;
    });
    html += '</div>';
    filterDiv.innerHTML = html;
}

function v7ApplyFilters() {
    if (!window.v7CurrentFullData) return;
    const cbs = document.querySelectorAll('.v7-sample-filter-cb');
    const activeSamples = new Set();
    cbs.forEach(cb => { if (cb.checked) activeSamples.add(cb.value); });
    
    const filteredResults = window.v7CurrentFullData.results.filter(r => activeSamples.has(r.sample));
    const filteredComps = {};
    if (window.v7CurrentFullData.comparisons) {
        for (const [key, pairs] of Object.entries(window.v7CurrentFullData.comparisons)) {
            filteredComps[key] = pairs.filter(c => activeSamples.has(c.pair[0]) && activeSamples.has(c.pair[1]));
        }
    }
    const filteredData = { results: filteredResults, comparisons: filteredComps };
    v7Plot(filteredData);
    v7UpdateTable(filteredResults);
}

function v7UpdateTable(results) {
    const tbody = document.querySelector('#v7-table tbody'); tbody.innerHTML = '';
    results.forEach(res => {
        const stats = res.metrics; const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${res.sample}</strong></td><td>${res.replicates.length}</td><td>${stats.mean.avg.toFixed(2)} ± ${stats.mean.sem.toFixed(2)}</td><td>${stats.median.avg.toFixed(2)}</td><td>${stats.kurtosis.avg.toFixed(2)}</td><td>${stats.cv.avg.toFixed(2)}%</td>`;
        tbody.appendChild(tr);
    });
}

function v7UpdateAxes() { v7ApplyFilters(); }

function getStars(p) {
    if (p < 0.0001) return '****'; if (p < 0.001) return '***';
    if (p < 0.01) return '**'; if (p < 0.05) return '*';
    return 'ns';
}

function v7DownloadPlot(divId, filename) {
    Plotly.downloadImage(divId, {format: 'png', width: 600, height: 1000, scale: 2, filename: filename});
}

function v7Plot(fullData) {
    const results = fullData.results; const comps = fullData.comparisons;
    const distLog = document.getElementById('toggle-dist-log').checked;
    const minDistStr = document.getElementById('min-dist') ? document.getElementById('min-dist').value : "";
    const maxDistStr = document.getElementById('max-dist') ? document.getElementById('max-dist').value : "";
    
    const colors = ['#000000', '#FF0000', '#0000FF', '#008000', '#FFA500', '#800080'];
    const sampleNames = results.map(r => r.sample);

    // Get global max/min for fallback range calculation
    let distGlobalMax = -Infinity;
    let distGlobalMin = Infinity;

    const getLayout = (title, yAxisTitle, metricKey) => {
        const yLog = document.getElementById(`log-${metricKey}`).checked;
        const minValStr = document.getElementById(`min-${metricKey}`).value;
        const maxValStr = document.getElementById(`max-${metricKey}`).value;
        const annotations = []; const shapes = [];
        
        let maxBracketY = 0;
        let maxHeight = 0;
        if (comps && comps[metricKey] && results.length > 1) {
            results.forEach(res => {
                const barTop = res.metrics[metricKey].avg + res.metrics[metricKey].sem;
                if (barTop > maxHeight) maxHeight = barTop;
                
                if (res.replicates) {
                    res.replicates.forEach(r => {
                        if (r[metricKey] > maxHeight) maxHeight = r[metricKey];
                    });
                }
            });
            if (maxHeight <= 0) maxHeight = 1;
            
            const step = yLog ? Math.log10(maxHeight) * 0.15 : maxHeight * 0.15;
            let bracketIdx = 0;
            comps[metricKey].forEach((c) => {
                const [s1, s2] = c.pair;
                const idx1 = results.findIndex(r => r.sample === s1);
                const idx2 = results.findIndex(r => r.sample === s2);
                if (idx1 > -1 && idx2 > -1) {
                    const stars = getStars(c.p_val);
                    if (stars === 'ns') return; // Skip drawing brackets for non-significant pairs
                    
                    const bracketY = yLog ? maxHeight * Math.pow(1.4, bracketIdx + 1) : maxHeight + (step * (bracketIdx + 1));
                    if (bracketY > maxBracketY) maxBracketY = bracketY;
                    
                    shapes.push({ type: 'line', x0: s1, x1: s1, y0: bracketY * 0.97, y1: bracketY, line: { color: 'black', width: 1.5 } });
                    shapes.push({ type: 'line', x0: s1, x1: s2, y0: bracketY, y1: bracketY, line: { color: 'black', width: 1.5 } });
                    shapes.push({ type: 'line', x0: s2, x1: s2, y0: bracketY * 0.97, y1: bracketY, line: { color: 'black', width: 1.5 } });

                    const midX = (idx1 + idx2) / 2;
                    annotations.push({
                        x: midX, y: bracketY, text: stars, showarrow: false, yshift: 2,
                        font: { family: 'Arial', size: 16, color: 'black', weight: 'bold' }, 
                        xref: 'x', yref: 'y', xanchor: 'center', yanchor: 'bottom'
                    });
                    bracketIdx++;
                }
            });
        }

        let yAxisConfig = { 
            title: yAxisTitle, type: yLog ? 'log' : 'linear', autorange: true, 
            showgrid: false, linecolor: 'black', linewidth: 2, ticks: 'outside' 
        };

        if (minValStr !== "" || maxValStr !== "") {
            yAxisConfig.autorange = false;
            let rangeMin = minValStr !== "" ? parseFloat(minValStr) : (yLog ? 1 : 0);
            let rangeMax = maxValStr !== "" ? parseFloat(maxValStr) : Math.max(maxHeight * 1.5, maxBracketY * 1.2);
            
            if (yLog) {
                rangeMin = rangeMin > 0 ? Math.log10(rangeMin) : 0;
                rangeMax = rangeMax > 0 ? Math.log10(rangeMax) : 1;
            }
            yAxisConfig.range = [rangeMin, rangeMax];
        }
        
        return {
            title: { text: title, font: { family: 'Arial', size: 20, color: 'black', weight: 'bold' } },
            paper_bgcolor: 'white', plot_bgcolor: 'white',
            xaxis: { 
                title: { text: 'Group', font: { family: 'Arial', size: 16, color: 'black', weight: 'bold' }, standoff: 20 }, 
                type: 'category', 
                categoryorder: 'array', categoryarray: sampleNames,
                tickmode: 'linear', tickangle: -45, // Forces all labels to render and prevents collision
                showgrid: false, linecolor: 'black', linewidth: 2, ticks: 'outside', tickfont: { family: 'Arial', size: 14, color: 'black' }
            },
            yaxis: Object.assign(yAxisConfig, { 
                title: { text: yAxisTitle, font: { family: 'Arial', size: 16, color: 'black', weight: 'bold' } }, 
                tickfont: { family: 'Arial', size: 14, color: 'black' } 
            }),
            showlegend: false, annotations: annotations, shapes: shapes,
            margin: { l: 80, r: 20, t: 80, b: 120 }, height: 650, width: Math.max(350, results.length * 65),
            bargap: 0.4
        };
    };

    const createTraces = (metricKey) => {
        const yLog = document.getElementById(`log-${metricKey}`).checked;
        const traces = [];
        
        results.forEach((res, i) => {
            const c = colors[i % colors.length];
            const avg = res.metrics[metricKey].avg;
            const sem = res.metrics[metricKey].sem;
            
            if (yLog && avg <= 0) return;
            
            traces.push({
                x: [res.sample], y: [avg], type: 'bar',
                marker: { color: 'rgba(0,0,0,0)', line: { color: 'black', width: 2 } },
                error_y: { type: 'data', array: [sem], visible: true, thickness: 1.5, width: 6, color: 'black' },
                hoverinfo: 'none'
            });
            
            traces.push({
                x: Array(res.replicates.length).fill(res.sample),
                y: res.replicates.map(r => r[metricKey]).filter(v => !yLog || v > 0),
                mode: 'markers', type: 'scatter', 
                marker: { color: c, size: 7, opacity: 0.8, line: { color: 'black', width: 1 } },
                jitter: 0.6
            });
        });

        // Invisible anchor trace if autorange is true
        const minValStr = document.getElementById(`min-${metricKey}`).value;
        const maxValStr = document.getElementById(`max-${metricKey}`).value;
        if (minValStr === "" && maxValStr === "") {
            const layout = getLayout('', '', metricKey);
            const maxBracketYForAnchor = layout.shapes.length > 0 ? layout.shapes.reduce((max, s) => Math.max(max, s.y1), 0) : 0;
            if (maxBracketYForAnchor > 0) {
                traces.push({
                    x: [sampleNames[0]], y: [maxBracketYForAnchor * (yLog ? 1.5 : 1.1)],
                    mode: 'markers', type: 'scatter', marker: { color: 'rgba(0,0,0,0)' }, hoverinfo: 'none', showlegend: false
                });
            }
        }
        
        return traces;
    };

    // Force DOM expansion for horizontal scrolling to prevent Plotly from squishing responsive charts
    const chartWidth = Math.max(350, results.length * 65);
    ['plot-mean', 'plot-median', 'plot-kurtosis', 'plot-cv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '';
            el.style.minWidth = chartWidth + 'px';
            if (el.parentElement) el.parentElement.style.minWidth = (chartWidth + 30) + 'px';
        }
    });

    Plotly.newPlot('plot-mean', createTraces('mean'), getLayout('Mean', 'Intensity', 'mean'), {responsive: true, displayModeBar: false});
    Plotly.newPlot('plot-median', createTraces('median'), getLayout('Median', 'Intensity', 'median'), {responsive: true, displayModeBar: false});
    Plotly.newPlot('plot-kurtosis', createTraces('kurtosis'), getLayout('Kurtosis', 'Excess Kurtosis', 'kurtosis'), {responsive: true, displayModeBar: false});
    Plotly.newPlot('plot-cv', createTraces('cv'), getLayout('CV (%)', 'Noise (%)', 'cv'), {responsive: true, displayModeBar: false});

    const stackedTraces = [];
    results.forEach((res, i) => {
        const c = colors[i % colors.length];
        let pooledData = res.replicates.flatMap(r => r.sample_data);
        if (distLog) pooledData = pooledData.filter(v => v > 0);
        
        if (pooledData.length === 0) return;
        
        let pMax = Math.max(...pooledData);
        let pMin = Math.min(...pooledData);
        if (pMax > distGlobalMax) distGlobalMax = pMax;
        if (pMin < distGlobalMin) distGlobalMin = pMin;
        
        // Top Panel: Centered Scatter Dots
        stackedTraces.push({
            type: 'box', 
            y: pooledData,
            x: Array(pooledData.length).fill(res.sample), // Explicitly bind to X category
            name: res.sample, 
            xaxis: 'x2', // Top X-axis
            yaxis: 'y2', // Top Y-axis
            fillcolor: 'rgba(0,0,0,0)', 
            line: { color: 'rgba(0,0,0,0)', width: 0 }, 
            boxpoints: 'all', 
            pointpos: 0, // Centered perfectly
            jitter: 1, // '1' perfectly matches the width of the box below it
            marker: { color: c, size: 2.5, opacity: 0.5, line: { width: 0 } }, 
            showlegend: false
        });

        // Bottom Panel: Box Plot
        stackedTraces.push({
            type: 'box', 
            y: pooledData,
            x: Array(pooledData.length).fill(res.sample), // Explicitly bind to X category
            name: res.sample, 
            xaxis: 'x', // Bottom X-axis
            yaxis: 'y', // Bottom Y-axis
            line: { color: 'black', width: 1.5 }, 
            fillcolor: c, // Match the color of the dots
            opacity: 0.8, 
            boxpoints: false, 
            showlegend: false
        });
    });
    
    let distYAxis1 = { 
        type: distLog ? 'log' : 'linear', 
        dtick: distLog ? 1 : undefined,
        autorange: true,
        domain: [0, 0.499], // Bottom 49.9% (Microscopic gap)
        showgrid: false, showline: true, linecolor: 'black', linewidth: 2, ticks: 'outside', 
        tickfont: { family: 'Arial', size: 14, color: 'black' }
    };
    
    let distYAxis2 = { 
        type: distLog ? 'log' : 'linear', 
        dtick: distLog ? 1 : undefined,
        autorange: true,
        domain: [0.501, 1], // Top 49.9%
        showgrid: false, showline: true, linecolor: 'black', linewidth: 2, ticks: 'outside', 
        tickfont: { family: 'Arial', size: 14, color: 'black' }
    };

    let distShapes = [];
    let distAnnotations = [{
        text: 'Fluorescence Intensity',
        font: { family: 'Arial', size: 16, color: 'black', weight: 'bold' },
        x: 0, y: 0.5, xref: 'paper', yref: 'paper', xshift: -75, // Shifted more to accommodate larger font
        textangle: -90, showarrow: false
    }];

    if (minDistStr !== "" || maxDistStr !== "") {
        distYAxis1.autorange = false;
        distYAxis2.autorange = false;
        let rMin = minDistStr !== "" ? parseFloat(minDistStr) : distGlobalMin;
        let rMax = maxDistStr !== "" ? parseFloat(maxDistStr) : distGlobalMax;
        if (distLog) { rMin = rMin > 0 ? Math.log10(rMin) : 0; rMax = rMax > 0 ? Math.log10(rMax) : 1; }
        distYAxis1.range = [rMin, rMax]; distYAxis2.range = [rMin, rMax];
    }
    
    Plotly.newPlot('v7-dist-plot', stackedTraces, {
        title: { text: 'Population Heterogeneity', font: { family: 'Arial', size: 20, color: 'black', weight: 'bold' } }, 
        paper_bgcolor: 'white', plot_bgcolor: 'white',
        yaxis: distYAxis1, yaxis2: distYAxis2,
        xaxis: { 
            categoryorder: 'array', categoryarray: sampleNames,
            tickmode: 'linear', tickangle: -45, // Adding angle here too for consistency if needed
            showgrid: false, showline: true, linecolor: 'black', linewidth: 2, ticks: 'outside', 
            tickfont: { family: 'Arial', size: 14, color: 'black', weight: 'bold' } 
        },
        xaxis2: {
            overlaying: 'x', matches: 'x', anchor: 'y2', 
            showgrid: false, showline: true, linecolor: 'black', linewidth: 2, ticks: '', showticklabels: false
        },
        margin: { l: 110, r: 20, t: 50, b: 80 }, // Increased margins for bigger fonts
        height: 700, 
        width: Math.max(300, results.length * 120), // Increased overall width to allow for thicker bars
        boxgap: 0.1, boxmode: 'overlay', // Reduced gap significantly to make boxes much wider
        shapes: distShapes,
        annotations: distAnnotations
    }, {responsive: true, displayModeBar: false});
}

window.onload = v7RenderGroups;
