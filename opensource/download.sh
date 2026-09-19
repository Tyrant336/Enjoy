#!/bin/bash
# Clone all vetted open-source repos (shallow) into opensource/, grouped by agent.
cd "$(dirname "$0")"
clone() { # $1=group $2=repo $3=name
  local dir="$1/$3"
  if [ -d "$dir/.git" ]; then echo "SKIP $dir (exists)"; return; fi
  git clone --depth 1 --quiet "https://github.com/$2" "$dir" \
    && echo "OK   $dir" || echo "FAIL $dir"
}

# --- Fishboat: scheduler / task breakdown ---
clone 01-scheduler-fishboat Cletrix-Labs/study-revision-planner study-revision-planner &
clone 01-scheduler-fishboat yoheinakajima/babyagi babyagi &
clone 01-scheduler-fishboat nicucalcea/obsidian-magic-tasks obsidian-magic-tasks &
clone 01-scheduler-fishboat langchain-ai/langgraph-supervisor-py langgraph-supervisor &
clone 01-scheduler-fishboat ikangai/clive clive &
wait

# --- Small boats: anki flashcards ---
clone 02-anki-smallboats mauroforlin/anki-llm-flashcard-generator anki-llm-flashcard-generator &
clone 02-anki-smallboats PromtEngineer/Anki_FlashCard_Generator Anki_FlashCard_Generator &
clone 02-anki-smallboats raine/anki-llm anki-llm &
clone 02-anki-smallboats kerrickstaley/genanki genanki &
clone 02-anki-smallboats open-spaced-repetition/py-fsrs py-fsrs &
clone 02-anki-smallboats lucagrippa/md2anki md2anki &
wait

# --- Underwater: knowledge graph ---
clone 03-knowledge-graph langchain-ai/langchain-experimental langchain-experimental &
clone 03-knowledge-graph HKUDS/LightRAG LightRAG &
clone 03-knowledge-graph vasturiano/react-force-graph react-force-graph &
clone 03-knowledge-graph MaartenGr/KeyBERT KeyBERT &
clone 03-knowledge-graph gusye1234/nano-graphrag nano-graphrag &
wait

# --- Orchestrator ---
clone 04-orchestrator wassim249/fastapi-langgraph-agent-production-ready-template fastapi-langgraph-template &
clone 04-orchestrator langchain-ai/langgraph-swarm-py langgraph-swarm &
clone 04-orchestrator hexgrad/kokoro kokoro &
clone 04-orchestrator SYSTRAN/faster-whisper faster-whisper &
wait

# --- Frontend: water, camera, townscaper grid ---
clone 05-frontend-world thaslle/stylized-water stylized-water &
clone 05-frontend-world achrefelouafi/WaterThreeJS WaterThreeJS &
clone 05-frontend-world Ameobea/three-good-godrays three-good-godrays &
clone 05-frontend-world sketchpunklabs/irregular_grid irregular_grid &
clone 05-frontend-world yomotsu/camera-controls camera-controls &
clone 05-frontend-world FarazzShaikh/THREE-CustomShaderMaterial THREE-CustomShaderMaterial &
wait

# --- Single-file grabs (from huge monorepos not worth cloning) ---
mkdir -p 01-scheduler-fishboat/langgraph-plan-and-execute
curl -sL --fail -o 01-scheduler-fishboat/langgraph-plan-and-execute/plan-and-execute.ipynb \
  "https://raw.githubusercontent.com/langchain-ai/langgraph/main/examples/plan-and-execute/plan-and-execute.ipynb" \
  && echo "OK   plan-and-execute.ipynb" || echo "FAIL plan-and-execute.ipynb"

# --- Assets: NOT downloaded here. The 3 locked models live in 06-assets-cc0/
# --- (fishboat.glb + lamp-buoy.glb custom-built; smallboat.glb from Kenney CC0).

echo "=== DONE ==="
