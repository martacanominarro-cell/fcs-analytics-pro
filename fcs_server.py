import os
import math
import tempfile
import numpy as np
import fcsparser
import pandas as pd
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
from scipy.stats import kurtosis, skew, ttest_ind
import json

app = FastAPI(title="FCS Analysis API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_stats(data: np.ndarray):
    if len(data) == 0:
        return {"mean": 0.0, "median": 0.0, "std": 0.0, "cv": 0.0, "kurtosis": 0.0, "count": 0, "sample_data": []}
    
    data = data[~np.isnan(data)]
    m = float(np.mean(data))
    med = float(np.median(data))
    s = float(np.std(data))
    k = float(kurtosis(data))
    count = int(len(data))
    cv = (s / m * 100) if m != 0 else 0.0
    
    sample_size = min(1000, len(data))
    sample = np.random.choice(data, sample_size, replace=False).tolist() if len(data) > 0 else []
    return {"mean": m, "median": med, "std": s, "cv": cv, "kurtosis": k, "count": count, "sample_data": sample}

def perform_stats(results_list: List[Dict]):
    metrics = ["mean", "median", "kurtosis", "cv"]
    stats_out = {}
    for metric in metrics:
        stats_out[metric] = []
        for i in range(len(results_list)):
            for j in range(i + 1, len(results_list)):
                g1, g2 = results_list[i], results_list[j]
                vals1 = [r[metric] for r in g1['replicates']]
                vals2 = [r[metric] for r in g2['replicates']]
                if len(vals1) > 1 and len(vals2) > 1:
                    _, p_val = ttest_ind(vals1, vals2)
                    if math.isnan(p_val): p_val = 1.0
                    stats_out[metric].append({"pair": [g1['sample'], g2['sample']], "p_val": float(p_val)})
    
    # Calculate stats for pooled single-cell data (Heterogeneity Plot)
    stats_out["heterogeneity"] = []
    for i in range(len(results_list)):
        for j in range(i + 1, len(results_list)):
            g1, g2 = results_list[i], results_list[j]
            vals1 = []
            for r in g1['replicates']: vals1.extend(r['sample_data'])
            vals2 = []
            for r in g2['replicates']: vals2.extend(r['sample_data'])
            if len(vals1) > 1 and len(vals2) > 1:
                _, p_val = ttest_ind(vals1, vals2)
                if math.isnan(p_val): p_val = 1.0
                stats_out["heterogeneity"].append({"pair": [g1['sample'], g2['sample']], "p_val": float(p_val)})
                
    return stats_out

@app.post("/get-channels")
async def get_channels(file: UploadFile = File(...)):
    import tempfile
    import os
    suffix = ".csv" if file.filename.endswith(".csv") else ".fcs"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        if suffix == ".csv":
            df = pd.read_csv(tmp_path, nrows=0)
            channels = df.columns.tolist()
        else:
            meta, data = fcsparser.parse(tmp_path, reformat_meta=True)
            channels = data.columns.tolist()
        return {"channels": channels}
    except Exception as e:
        return {"error": str(e)}
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.post("/analyze-upload")
async def analyze_upload(files: List[UploadFile] = File(...), mapping: str = Form(...), channel: str = Form(...)):
    mapping_dict = json.loads(mapping)
    results = []
    
    with tempfile.TemporaryDirectory() as temp_dir:
        saved_paths = {}
        for file in files:
            path = os.path.join(temp_dir, file.filename)
            content = await file.read()
            with open(path, "wb") as f:
                f.write(content)
            saved_paths[file.filename] = path

        for group_name, filenames in mapping_dict.items():
            group_replicates = []
            for fname in filenames:
                if fname not in saved_paths: continue
                try:
                    path = saved_paths[fname]
                    data = pd.read_csv(path) if fname.lower().endswith('.csv') else fcsparser.parse(path)[1]
                    target_col = next((c for c in data.columns if channel.lower() in c.lower()), channel)
                    if target_col not in data.columns: continue
                    channel_data = data[target_col].values
                    stats = get_stats(channel_data)
                    stats["filename"] = fname
                    stats["sample"] = group_name
                    group_replicates.append(stats)
                except Exception as e:
                    print(e)
                    continue
            
            if not group_replicates: continue
            
            df_group = pd.DataFrame(group_replicates)
            summary = {"sample": group_name, "replicates": group_replicates, "metrics": {}}
            for m in ["mean", "median", "cv", "kurtosis"]:
                summary["metrics"][m] = {"avg": float(df_group[m].mean()), "std": float(df_group[m].std()) if len(group_replicates)>1 else 0.0, "sem": (float(df_group[m].std()) / np.sqrt(len(group_replicates))) if len(group_replicates)>1 else 0.0}
            results.append(summary)
            
    return JSONResponse(content={"results": results, "comparisons": perform_stats(results)})

@app.get("/")
async def get_index(): return FileResponse('index.html')
@app.get("/style.css")
async def get_style(): return FileResponse('style.css')
@app.get("/script.js")
async def get_js(): return FileResponse('script.js')

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8127, timeout_keep_alive=600)
