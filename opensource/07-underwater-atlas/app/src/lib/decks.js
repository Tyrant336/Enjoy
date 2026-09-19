/* ═══════════════════════════════════════════════════════════════════════
   Canned decks for Anki Abyss.

   A "PDF import" never actually reads the file — the filename is hashed
   and deterministically selects one of these decks, so the same filename
   always surfaces the same reef of knowledge.

   Deck shape:
     clusters: [{id, name, color, anchor:[x,y,z]}]
     nodes:    [name, clusterId, weight 1-6, gloss][]
     edges:    [source, target, 'pre' directed prerequisite | 'rel' related][]
   ═══════════════════════════════════════════════════════════════════════ */

/* Seven reef jewel tones — matched luminance, evenly spaced hues, solid
   enough to read as beads on bright turquoise water (normal blending). */
const REEF = {
  coral:  '#e0492e',
  amber:  '#d9920a',
  azure:  '#2176d2',
  lime:   '#4d9e2f',
  teal:   '#0d9e9a',
  violet: '#7c4dcc',
  pink:   '#d63384',
};

/* ── Deck 1 · Marine Biology (the default reef) ─────────────────────────── */
const MARINE = {
  id: 'marine', name: 'Marine Biology',
  clusters: [
    {id:'reef',     name:'Coral Reefs',        color:REEF.coral,  anchor:[-0.85, -0.42, 0.30]},
    {id:'fish',     name:'Reef Fish',          color:REEF.amber,  anchor:[-0.55,  0.30, 0.78]},
    {id:'mammal',   name:'Marine Mammals',     color:REEF.azure,  anchor:[ 0.10,  0.72, 0.40]},
    {id:'plankton', name:'Plankton & Microbes',color:REEF.lime,   anchor:[ 0.86,  0.26, -0.10]},
    {id:'ocean',    name:'Oceanography',       color:REEF.teal,   anchor:[ 0.42, -0.70, -0.30]},
    {id:'eco',      name:'Marine Ecology',     color:REEF.violet, anchor:[ 0.30,  0.34, -0.88]},
    {id:'conserve', name:'Conservation',       color:REEF.pink,   anchor:[-0.62, -0.15, -0.72]},
  ],
  nodes: [
    ['Coral Polyps','reef',5,'Tiny colonial animals that secrete calcium carbonate skeletons and build the reef itself.'],
    ['Zooxanthellae','reef',4,'Symbiotic algae living inside coral tissue, supplying most of the coral’s energy via photosynthesis.'],
    ['Reef Structure','reef',5,'The three-dimensional calcium-carbonate framework that shelters a quarter of all marine species.'],
    ['Coral Bleaching','reef',4,'Stress-induced expulsion of zooxanthellae that leaves coral white, starving, and vulnerable.'],
    ['Reef Zonation','reef',3,'Distinct bands — lagoon, reef flat, crest, slope — shaped by light, depth, and wave energy.'],
    ['Calcification','reef',3,'The deposition of calcium carbonate by corals and algae; slowed by falling ocean pH.'],
    ['Fringing Reef','reef',3,'A reef growing directly from a shoreline, the youngest stage of reef development.'],
    ['Atoll Formation','reef',3,'A ring of reef around a lagoon, formed as a volcanic island subsides beneath its fringing reef.'],

    ['Clownfish','fish',3,'Anemone-dwelling fish protected by a mucus coat, a classic case of mutualism.'],
    ['Parrotfish','fish',3,'Grazers whose beaks scrape algae from coral, excreting much of the reef’s white sand.'],
    ['Damselfish','fish',2,'Small territorial fish that farm algal gardens on dead coral patches.'],
    ['Reef Sharks','fish',4,'Top predators that keep mid-level predator populations in check across the reef.'],
    ['Schooling Behavior','fish',3,'Coordinated group swimming that confuses predators and improves foraging efficiency.'],
    ['Camouflage','fish',3,'Color, pattern, and texture adaptations that let reef animals avoid detection.'],
    ['Symbiosis','fish',4,'Long-term close associations — mutualism, commensalism, parasitism — that structure reef life.'],
    ['Herbivory','fish',3,'Grazing on algae that would otherwise overgrow and smother coral colonies.'],

    ['Dolphins','mammal',4,'Highly social toothed whales that hunt cooperatively using echolocation.'],
    ['Baleen Whales','mammal',4,'Filter-feeding giants that strain krill and small fish through baleen plates.'],
    ['Echolocation','mammal',4,'Biological sonar: clicks emitted and interpreted to image prey and terrain in dark water.'],
    ['Blubber','mammal',2,'A thick insulating fat layer that also stores energy and streamlines the body.'],
    ['Migration','mammal',3,'Seasonal long-distance movements between feeding and breeding grounds.'],
    ['Breaching','mammal',2,'Leaping clear of the surface, possibly for communication, parasite removal, or play.'],
    ['Whale Song','mammal',3,'Long patterned vocalizations, especially of humpbacks, used in mating and contact.'],

    ['Phytoplankton','plankton',5,'Drifting photosynthetic microbes that produce roughly half of Earth’s oxygen.'],
    ['Zooplankton','plankton',4,'Drifting animals, from copepods to larvae, that link primary producers to larger predators.'],
    ['Photosynthesis','plankton',5,'Conversion of light, water, and CO₂ into organic matter and oxygen — the base of the food web.'],
    ['Marine Snow','plankton',3,'A continuous fall of organic detritus that carries surface production to the deep sea.'],
    ['Red Tides','plankton',3,'Harmful algal blooms that discolor water and may release toxins affecting fish and people.'],
    ['Microbial Loop','plankton',3,'Bacteria and grazers recycling dissolved organic matter back into the food web.'],
    ['Diatoms','plankton',3,'Silica-shelled phytoplankton responsible for a large share of ocean primary production.'],

    ['Thermocline','ocean',4,'A steep vertical temperature gradient that separates warm surface water from the cold deep.'],
    ['Salinity','ocean',3,'Dissolved salt content; together with temperature it drives density-driven circulation.'],
    ['Ocean Currents','ocean',5,'Wind- and density-driven flows that redistribute heat, nutrients, and larvae worldwide.'],
    ['Tides','ocean',3,'Periodic sea-level rise and fall driven by the gravity of the moon and sun.'],
    ['Upwelling','ocean',4,'Deep nutrient-rich water rising to the surface, fueling some of the richest fisheries on Earth.'],
    ['Light Attenuation','ocean',3,'The rapid fading of sunlight with depth, which sets the limit of photosynthesis.'],
    ['Wave Dynamics','ocean',3,'Wind-generated surface waves that shape coasts and control reef crest communities.'],
    ['El Niño','ocean',4,'A periodic warming of the eastern Pacific that disrupts currents, upwelling, and weather worldwide.'],

    ['Food Webs','eco',5,'The network of who-eats-whom that moves energy from plankton to apex predators.'],
    ['Keystone Species','eco',4,'Species whose impact on the community is far larger than their abundance suggests.'],
    ['Predation','eco',3,'Consumption of prey by predators — a top-down force shaping populations and behavior.'],
    ['Competition','eco',3,'Rivalry for limited resources such as space, light, and food.'],
    ['Nutrient Cycling','eco',4,'The movement of nitrogen, phosphorus, and carbon through organisms and seawater.'],
    ['Biodiversity','eco',4,'The variety of life in an ecosystem; reefs are the ocean’s richest reservoirs.'],
    ['Trophic Cascades','eco',3,'Effects that ripple down the food web when top predators are added or removed.'],

    ['Marine Protected Areas','conserve',4,'Zones restricting extraction so populations and habitats can recover.'],
    ['Overfishing','conserve',4,'Harvesting fish faster than they can reproduce, collapsing stocks and food webs.'],
    ['Ocean Acidification','conserve',5,'Falling pH as the ocean absorbs CO₂, eroding the ability of organisms to build shells and reefs.'],
    ['Plastic Pollution','conserve',3,'Persistent debris that entangles wildlife and fragments into microplastics entering food webs.'],
    ['Bycatch','conserve',2,'Non-target animals caught in fishing gear, a major threat to turtles, sharks, and mammals.'],
    ['Coral Restoration','conserve',3,'Growing coral fragments in nurseries and outplanting them to rebuild damaged reefs.'],
    ['Sustainable Fisheries','conserve',3,'Managing catch limits, gear, and seasons so harvests never exceed replenishment.'],
  ],
  edges: [
    ['Photosynthesis','Phytoplankton','pre'],['Light Attenuation','Photosynthesis','pre'],['Zooxanthellae','Photosynthesis','rel'],
    ['Phytoplankton','Zooplankton','pre'],['Phytoplankton','Marine Snow','pre'],['Phytoplankton','Red Tides','pre'],
    ['Phytoplankton','Food Webs','pre'],['Zooplankton','Baleen Whales','pre'],['Zooplankton','Food Webs','pre'],
    ['Marine Snow','Nutrient Cycling','pre'],['Microbial Loop','Nutrient Cycling','pre'],['Diatoms','Phytoplankton','rel'],
    ['Diatoms','Marine Snow','pre'],['Nutrient Cycling','Red Tides','rel'],

    ['Coral Polyps','Reef Structure','pre'],['Coral Polyps','Calcification','pre'],['Calcification','Reef Structure','pre'],
    ['Zooxanthellae','Coral Polyps','pre'],['Reef Structure','Reef Zonation','pre'],['Reef Structure','Fringing Reef','pre'],
    ['Fringing Reef','Atoll Formation','pre'],['Ocean Acidification','Coral Bleaching','pre'],['Ocean Acidification','Calcification','pre'],
    ['Coral Bleaching','Coral Restoration','pre'],['Coral Polyps','Coral Bleaching','pre'],['El Niño','Coral Bleaching','pre'],
    ['Wave Dynamics','Reef Structure','rel'],['Light Attenuation','Reef Zonation','pre'],

    ['Symbiosis','Clownfish','pre'],['Clownfish','Coral Polyps','rel'],['Herbivory','Parrotfish','pre'],
    ['Parrotfish','Reef Structure','rel'],['Damselfish','Herbivory','rel'],['Schooling Behavior','Predation','rel'],
    ['Camouflage','Predation','rel'],['Reef Sharks','Trophic Cascades','pre'],['Reef Sharks','Keystone Species','rel'],
    ['Dolphins','Schooling Behavior','rel'],['Reef Zonation','Herbivory','rel'],['Competition','Damselfish','rel'],
    ['Camouflage','Symbiosis','rel'],['Symbiosis','Zooxanthellae','rel'],

    ['Echolocation','Dolphins','pre'],['Blubber','Migration','rel'],['Migration','Baleen Whales','pre'],
    ['Whale Song','Breaching','rel'],['Baleen Whales','Whale Song','pre'],['Upwelling','Baleen Whales','rel'],
    ['Migration','Whale Song','rel'],['Dolphins','Whale Song','rel'],

    ['Salinity','Ocean Currents','pre'],['Ocean Currents','Thermocline','rel'],['Tides','Wave Dynamics','rel'],
    ['Tides','Reef Zonation','rel'],['Thermocline','Upwelling','pre'],['Ocean Currents','El Niño','pre'],
    ['El Niño','Upwelling','rel'],['Upwelling','Nutrient Cycling','pre'],['Upwelling','Phytoplankton','pre'],
    ['Light Attenuation','Thermocline','rel'],['El Niño','Red Tides','rel'],

    ['Food Webs','Predation','pre'],['Food Webs','Trophic Cascades','pre'],['Keystone Species','Trophic Cascades','pre'],
    ['Competition','Biodiversity','rel'],['Predation','Biodiversity','rel'],['Nutrient Cycling','Food Webs','pre'],
    ['Biodiversity','Marine Protected Areas','pre'],['Food Webs','Keystone Species','pre'],['Biodiversity','Keystone Species','pre'],
    ['Reef Zonation','Biodiversity','pre'],

    ['Overfishing','Trophic Cascades','pre'],['Overfishing','Sustainable Fisheries','pre'],['Overfishing','Bycatch','rel'],
    ['Bycatch','Sustainable Fisheries','pre'],['Ocean Acidification','Coral Restoration','pre'],['Plastic Pollution','Marine Protected Areas','rel'],
    ['Plastic Pollution','Bycatch','rel'],['Marine Protected Areas','Sustainable Fisheries','pre'],['Coral Restoration','Marine Protected Areas','rel'],
  ],
};

/* ── Deck 2 · Cell Biology ──────────────────────────────────────────────── */
const CELL = {
  id: 'cell', name: 'Cell Biology',
  clusters: [
    {id:'organelle',  name:'Organelles',           color:REEF.teal,   anchor:[-0.85, -0.42, 0.30]},
    {id:'metabolism', name:'Metabolism',           color:REEF.amber,  anchor:[-0.55,  0.30, 0.78]},
    {id:'genetics',   name:'Genetics & Expression',color:REEF.violet, anchor:[ 0.10,  0.72, 0.40]},
    {id:'membrane',   name:'Membranes & Transport',color:REEF.azure,  anchor:[ 0.86,  0.26, -0.10]},
    {id:'cycle',      name:'Cell Cycle',           color:REEF.lime,   anchor:[ 0.42, -0.70, -0.30]},
    {id:'signal',     name:'Signaling',            color:REEF.pink,   anchor:[ 0.30,  0.34, -0.88]},
    {id:'tech',       name:'Techniques',           color:REEF.coral,  anchor:[-0.62, -0.15, -0.72]},
  ],
  nodes: [
    ['Nucleus','organelle',5,'Membrane-bound compartment housing the genome and coordinating gene expression.'],
    ['Mitochondria','organelle',5,'Double-membrane organelles that generate most of the cell’s ATP.'],
    ['Ribosome','organelle',4,'RNA-protein machine that translates mRNA into polypeptide chains.'],
    ['Endoplasmic Reticulum','organelle',4,'Membrane network for protein folding (rough) and lipid synthesis (smooth).'],
    ['Golgi Apparatus','organelle',4,'Stacked cisternae that modify, sort, and ship proteins to their destinations.'],
    ['Lysosome','organelle',3,'Acidic vesicle whose enzymes digest macromolecules and worn-out organelles.'],
    ['Cytoskeleton','organelle',3,'Dynamic protein filaments that give shape, enable movement, and organize division.'],
    ['Chloroplast','organelle',3,'Plant organelle where the light reactions and carbon fixation of photosynthesis occur.'],

    ['Cellular Respiration','metabolism',5,'The full oxidation of glucose to capture energy as ATP.'],
    ['Glycolysis','metabolism',4,'Cytosolic splitting of glucose into pyruvate, netting a small yield of ATP.'],
    ['Krebs Cycle','metabolism',4,'Mitochondrial cycle oxidizing acetyl-CoA to load electron carriers NADH and FADH₂.'],
    ['Oxidative Phosphorylation','metabolism',4,'Electron transport and chemiosmosis producing the bulk of cellular ATP.'],
    ['Light Reactions','metabolism',3,'Light-driven splitting of water that yields ATP, NADPH, and oxygen.'],
    ['ATP Synthase','metabolism',3,'Rotary enzyme using a proton gradient to phosphorylate ADP.'],
    ['Fermentation','metabolism',2,'Anaerobic regeneration of NAD⁺ so glycolysis can continue without oxygen.'],
    ['Enzymes','metabolism',4,'Protein catalysts that lower activation energy and set the pace of metabolism.'],

    ['DNA Replication','genetics',5,'Semi-conservative copying of the genome before every cell division.'],
    ['Transcription','genetics',5,'Synthesis of an RNA copy from a DNA template by RNA polymerase.'],
    ['Translation','genetics',5,'Decoding of mRNA codons into an amino-acid sequence at the ribosome.'],
    ['Gene Regulation','genetics',4,'Control of when and how strongly genes are expressed.'],
    ['Mutation','genetics',3,'Heritable changes in DNA sequence — raw material of evolution, source of disease.'],
    ['Chromatin','genetics',3,'DNA wound around histones; its packing state gates access to genes.'],
    ['mRNA Processing','genetics',3,'Capping, splicing, and polyadenylation that mature a transcript for export.'],
    ['Operons','genetics',2,'Bacterial gene clusters switched on or off as a single unit.'],

    ['Phospholipid Bilayer','membrane',4,'The self-sealing fatty sheet forming every cell membrane.'],
    ['Membrane Proteins','membrane',3,'Channels, pumps, and receptors embedded in the bilayer.'],
    ['Osmosis','membrane',3,'Diffusion of water across a semipermeable membrane toward higher solute concentration.'],
    ['Active Transport','membrane',4,'ATP-powered movement of solutes against their gradients.'],
    ['Endocytosis','membrane',3,'Engulfing of external material by inward budding of the membrane.'],
    ['Exocytosis','membrane',2,'Vesicle fusion with the membrane to release cargo outside the cell.'],
    ['Ion Channels','membrane',3,'Gated pores that let specific ions cross, setting membrane potentials.'],

    ['Mitosis','cycle',5,'Division of the nucleus that partitions duplicated chromosomes into two daughter cells.'],
    ['Meiosis','cycle',4,'Two divisions producing haploid gametes with recombined chromosomes.'],
    ['Checkpoints','cycle',4,'Surveillance points that halt the cycle when DNA is damaged or spindles misattach.'],
    ['Cyclins and CDKs','cycle',4,'Oscillating protein pairs whose kinase activity drives the cycle forward.'],
    ['Apoptosis','cycle',3,'Programmed cell death — orderly self-destruction for development and safety.'],
    ['Cytokinesis','cycle',2,'Physical splitting of the cytoplasm after nuclear division.'],
    ['Interphase','cycle',3,'Growth and DNA-replication phase occupying most of the cell cycle.'],

    ['Receptors','signal',4,'Proteins that bind ligands and convert outside messages into intracellular events.'],
    ['Signal Transduction','signal',4,'Relay chains that amplify and route a receptor’s message to its targets.'],
    ['Second Messengers','signal',3,'Small diffusible molecules like cAMP and Ca²⁺ that spread signals inside the cell.'],
    ['Kinase Cascades','signal',3,'Chains of phosphorylation that amplify signals and commit the cell to responses.'],
    ['Hormone Signaling','signal',3,'Long-range communication by circulating ligands binding target-cell receptors.'],
    ['Cell Communication','signal',3,'The general exchange of signals that coordinates multicellular life.'],

    ['Microscopy','tech',3,'Imaging cells with light or electrons to reveal structure and dynamics.'],
    ['PCR','tech',3,'Exponential in-vitro amplification of a chosen DNA sequence.'],
    ['Gel Electrophoresis','tech',2,'Separating DNA or proteins by size as they migrate through a gel.'],
    ['CRISPR','tech',4,'Programmable guide-RNA nucleases for targeted genome editing.'],
    ['Cell Culture','tech',2,'Growing cells in controlled media for experiments.'],
    ['Flow Cytometry','tech',2,'Measuring and sorting thousands of single cells per second by fluorescence.'],
    ['Fluorescent Tagging','tech',3,'Attaching glowing markers such as GFP to watch molecules in living cells.'],
  ],
  edges: [
    ['Enzymes','Glycolysis','pre'],['Cellular Respiration','Glycolysis','pre'],['Glycolysis','Krebs Cycle','pre'],
    ['Krebs Cycle','Oxidative Phosphorylation','pre'],['Oxidative Phosphorylation','ATP Synthase','pre'],['Glycolysis','Fermentation','pre'],
    ['Mitochondria','Cellular Respiration','pre'],['Chloroplast','Light Reactions','pre'],['Light Reactions','ATP Synthase','rel'],
    ['ATP Synthase','Active Transport','rel'],['Enzymes','DNA Replication','rel'],['Enzymes','Signal Transduction','rel'],

    ['Nucleus','DNA Replication','pre'],['Nucleus','Transcription','pre'],['DNA Replication','Mutation','pre'],
    ['Transcription','mRNA Processing','pre'],['mRNA Processing','Translation','pre'],['Ribosome','Translation','pre'],
    ['Chromatin','Gene Regulation','pre'],['Gene Regulation','Operons','pre'],['Transcription','Gene Regulation','rel'],
    ['Translation','Membrane Proteins','pre'],['Translation','Enzymes','pre'],['Mutation','Meiosis','rel'],

    ['Phospholipid Bilayer','Membrane Proteins','pre'],['Phospholipid Bilayer','Osmosis','pre'],['Membrane Proteins','Ion Channels','pre'],
    ['Ion Channels','Active Transport','rel'],['Active Transport','Endocytosis','rel'],['Endocytosis','Lysosome','pre'],
    ['Golgi Apparatus','Exocytosis','pre'],['Endoplasmic Reticulum','Golgi Apparatus','pre'],['Ribosome','Endoplasmic Reticulum','rel'],
    ['Lysosome','Apoptosis','rel'],['Membrane Proteins','Receptors','pre'],['Exocytosis','Hormone Signaling','rel'],

    ['Interphase','Mitosis','pre'],['DNA Replication','Interphase','pre'],['Cyclins and CDKs','Checkpoints','pre'],
    ['Checkpoints','Mitosis','pre'],['Mitosis','Cytokinesis','pre'],['Meiosis','Mitosis','rel'],
    ['Checkpoints','Apoptosis','pre'],['Mutation','Checkpoints','rel'],['Cytoskeleton','Cytokinesis','pre'],
    ['Cytoskeleton','Mitosis','pre'],['Cyclins and CDKs','Interphase','rel'],

    ['Receptors','Signal Transduction','pre'],['Signal Transduction','Second Messengers','pre'],['Second Messengers','Kinase Cascades','pre'],
    ['Kinase Cascades','Gene Regulation','pre'],['Hormone Signaling','Receptors','pre'],['Cell Communication','Receptors','pre'],
    ['Kinase Cascades','Apoptosis','rel'],['Ion Channels','Signal Transduction','rel'],

    ['Fluorescent Tagging','Microscopy','pre'],['PCR','Gel Electrophoresis','pre'],['PCR','DNA Replication','rel'],
    ['CRISPR','Mutation','rel'],['CRISPR','Gene Regulation','rel'],['Cell Culture','Flow Cytometry','pre'],
    ['Fluorescent Tagging','Flow Cytometry','rel'],['Microscopy','Cytoskeleton','rel'],['Cell Culture','Microscopy','rel'],
  ],
};

/* ── Deck 3 · AI Technology (the original atlas, re-beached) ────────────── */
const AI = {
  id: 'ai', name: 'AI Technology',
  clusters: [
    {id:'math',  name:'Mathematical Foundations',   color:REEF.violet, anchor:[-0.85, -0.42, 0.30]},
    {id:'ml',    name:'Classical Machine Learning', color:REEF.teal,   anchor:[-0.55,  0.30, 0.78]},
    {id:'dl',    name:'Deep Learning',              color:REEF.lime,   anchor:[ 0.10,  0.72, 0.40]},
    {id:'llm',   name:'Large Models',               color:REEF.pink,   anchor:[ 0.86,  0.26, -0.10]},
    {id:'sys',   name:'Systems and Compute',        color:REEF.amber,  anchor:[ 0.42, -0.70, -0.30]},
    {id:'align', name:'Alignment and Safety',       color:REEF.coral,  anchor:[ 0.30,  0.34, -0.88]},
    {id:'app',   name:'Applications',               color:REEF.azure,  anchor:[-0.62, -0.15, -0.72]},
  ],
  nodes: [
    ['Linear Algebra','math',5,'Vectors, matrices, and linear transforms form the language of neural computation.'],
    ['Probability','math',5,'Probability distributions express uncertainty across estimation and generative modeling.'],
    ['Calculus','math',4,'Derivatives and the chain rule make gradient-based learning possible.'],
    ['Optimization','math',5,'Training searches for useful solutions on high-dimensional non-convex surfaces.'],
    ['Information Theory','math',4,'Entropy and KL divergence connect learning, loss functions, and compression.'],
    ['Graph Theory','math',3,'Nodes and edges describe computation graphs, attention patterns, and knowledge networks.'],
    ['Statistical Inference','math',3,'Inference estimates populations from finite samples and quantifies uncertainty.'],
    ['Numerical Computing','math',3,'Floating-point behavior, conditioning, and stability determine reliable computation.'],

    ['Supervised Learning','ml',5,'Models learn mappings from labeled input-output pairs.'],
    ['Unsupervised Learning','ml',4,'Algorithms discover structure in data without explicit labels.'],
    ['Reinforcement Learning','ml',5,'Policies improve through interaction, rewards, and delayed consequences.'],
    ['Decision Trees','ml',3,'Recursive feature splits produce interpretable rules.'],
    ['Ensemble Learning','ml',4,'Multiple learners combine votes or residual corrections for stronger predictions.'],
    ['Support Vector Machines','ml',3,'Maximum-margin classifiers use kernels to represent nonlinear boundaries.'],
    ['Clustering','ml',3,'Unlabeled samples are grouped by similarity, with evaluation as a central challenge.'],
    ['Dimensionality Reduction','ml',3,'High-dimensional data is compressed while preserving useful structure.'],
    ['Feature Engineering','ml',3,'Human-designed representations expose signal to traditional learning algorithms.'],
    ['Generalization and Overfitting','ml',5,'Performance beyond training data is managed with regularization and validation.'],

    ['Perceptron','dl',3,'A linear threshold unit and the smallest working neural-network model.'],
    ['Backpropagation','dl',6,'The chain rule computes gradients throughout a deep computation graph.'],
    ['Activation Functions','dl',3,'Nonlinear activations let stacked layers represent complex functions.'],
    ['Normalization','dl',4,'Normalized intermediate activations improve stability and convergence.'],
    ['Residual Connections','dl',5,'Skip paths preserve gradient flow through very deep networks.'],
    ['Convolutional Networks','dl',4,'Local receptive fields and weight sharing make image modeling efficient.'],
    ['Recurrent Networks','dl',3,'Sequential state updates model time but limit parallelism and long-range learning.'],
    ['Attention','dl',6,'Each position directly gathers global information according to learned relevance.'],
    ['Transformer','dl',6,'Stacked attention and feed-forward blocks underpin modern large models.'],
    ['Embeddings','dl',4,'Discrete symbols become continuous vectors with measurable semantic relationships.'],
    ['Self-Supervised Learning','dl',5,'Training signals are derived from the data itself at massive scale.'],
    ['Generative Adversarial Networks','dl',3,'Generators and discriminators improve through adversarial training.'],
    ['Diffusion Models','dl',4,'A learned denoising process turns noise into images, video, or other data.'],
    ['Graph Neural Networks','dl',3,'Message passing learns representations over graph-structured data.'],

    ['Pretraining','llm',6,'Large-scale pretraining builds reusable representations and broad capability.'],
    ['Tokenization','llm',3,'Text is segmented into subword units that determine model input efficiency.'],
    ['Positional Encoding','llm',3,'Order information is added to otherwise permutation-invariant attention.'],
    ['Scaling Laws','llm',5,'Loss follows predictable power laws with model size, data, and compute.'],
    ['Context Window','llm',4,'The token window limits how much material a model can consider at once.'],
    ['Instruction Tuning','llm',5,'Instruction-response examples adapt pretrained models into useful assistants.'],
    ['LoRA','llm',4,'Low-rank adapters enable efficient fine-tuning without updating every weight.'],
    ['Mixture of Experts','llm',4,'Each token activates a subset of experts, separating parameter count from compute.'],
    ['KV Cache','llm',4,'Cached keys and values avoid recomputing prior tokens during autoregressive decoding.'],
    ['Speculative Decoding','llm',3,'A smaller model drafts tokens that a larger model verifies in batches.'],
    ['Quantization','llm',4,'Lower-precision weights reduce memory footprint and bandwidth requirements.'],
    ['Chain of Thought','llm',5,'Intermediate reasoning steps improve performance on complex tasks.'],
    ['Retrieval Augmentation','llm',5,'External documents enter the context as current, inspectable knowledge.'],
    ['Tool Calling','llm',5,'Structured function calls delegate deterministic work to software tools.'],
    ['Agents','llm',6,'Planning, tool use, feedback, and replanning turn models into task executors.'],
    ['Long Context','llm',4,'Very large windows make attention cost and retrieval quality central concerns.'],
    ['Multimodality','llm',5,'Text, images, audio, and other signals share a unified representation space.'],

    ['GPU Architecture','sys',5,'Thousands of simple parallel cores match the dense arithmetic of deep learning.'],
    ['CUDA','sys',4,'Thread blocks and grids provide a practical programming model for GPU compute.'],
    ['Tensor Cores','sys',4,'Specialized matrix multiply-accumulate units accelerate low-precision training.'],
    ['Memory Bandwidth','sys',5,'Large-model inference often waits on moving weights rather than arithmetic.'],
    ['FlashAttention','sys',5,'Tiled attention avoids materializing the full intermediate attention matrix.'],
    ['Operator Fusion','sys',3,'Multiple small operations share one kernel and avoid memory round trips.'],
    ['Mixed Precision','sys',4,'Low-precision arithmetic with accurate accumulation improves speed and stability.'],
    ['Distributed Training','sys',5,'Training spans many accelerators and turns communication into a design constraint.'],
    ['Data Parallelism','sys',3,'Each accelerator holds a full model replica and processes different samples.'],
    ['Tensor Parallelism','sys',3,'Large matrix operations are split across devices at the cost of frequent communication.'],
    ['Pipeline Parallelism','sys',3,'Model layers are partitioned while microbatches flow through the stages.'],
    ['ZeRO','sys',3,'Optimizer state, gradients, and parameters are sharded across devices.'],
    ['Inference Serving','sys',5,'Online serving balances latency, throughput, batching, and reliability.'],
    ['Batch Scheduling','sys',4,'Continuous batching combines requests of different lengths to improve utilization.'],
    ['Compiler Optimization','sys',3,'Graphs are lowered into efficient kernels through capture and autotuning.'],
    ['Vector Databases','sys',3,'Approximate nearest-neighbor search stores and retrieves high-dimensional embeddings.'],

    ['Reward Models','align',4,'Preference data trains a scalable scoring function for model behavior.'],
    ['RLHF','align',5,'Reinforcement learning uses human preference signals to shape model behavior.'],
    ['DPO','align',4,'Direct preference optimization learns from preference pairs without a separate reward model.'],
    ['Hallucination','align',5,'Fluent but unsupported output is reduced through grounding and calibrated uncertainty.'],
    ['Interpretability','align',4,'Internal features and circuits are studied for debugging and safety.'],
    ['Red Teaming','align',4,'Adversarial testing seeks failure modes before release.'],
    ['Jailbreaks and Defense','align',3,'Attacks attempt to bypass safeguards while defenses harden model behavior.'],
    ['Evaluation Benchmarks','align',5,'Standardized tasks measure capability while contamination and overfitting limit trust.'],

    ['Code Generation','app',5,'Natural-language intent becomes executable software and tests.'],
    ['Search and Recommendation','app',4,'Embeddings and ranking select useful results from large candidate sets.'],
    ['Machine Translation','app',3,'Sequence-to-sequence translation was an early proving ground for attention.'],
    ['Speech Recognition','app',3,'End-to-end models convert audio directly into text.'],
    ['Computer Vision','app',4,'Models interpret images using convolutional and transformer architectures.'],
    ['Protein Structure','app',3,'Models predict three-dimensional folding from amino-acid sequences.'],
    ['Autonomous Driving','app',3,'Perception, prediction, and planning operate in a real-time safety-critical loop.'],
    ['Scientific Computing','app',3,'Neural methods accelerate or approximate numerical solvers in science and engineering.'],
  ],
  edges: [
    ['Linear Algebra','Dimensionality Reduction','pre'],['Linear Algebra','Perceptron','pre'],['Linear Algebra','Embeddings','pre'],
    ['Linear Algebra','Tensor Cores','pre'],['Probability','Statistical Inference','pre'],['Probability','Supervised Learning','pre'],
    ['Probability','Diffusion Models','pre'],['Probability','Information Theory','pre'],['Calculus','Optimization','pre'],
    ['Calculus','Backpropagation','pre'],['Optimization','Backpropagation','pre'],['Optimization','Reinforcement Learning','pre'],
    ['Information Theory','Generalization and Overfitting','pre'],['Information Theory','Quantization','pre'],['Graph Theory','Graph Neural Networks','pre'],
    ['Graph Theory','Attention','rel'],['Statistical Inference','Generalization and Overfitting','pre'],['Numerical Computing','Mixed Precision','pre'],
    ['Numerical Computing','Normalization','pre'],['Linear Algebra','Optimization','rel'],

    ['Supervised Learning','Decision Trees','pre'],['Supervised Learning','Support Vector Machines','pre'],['Supervised Learning','Generalization and Overfitting','pre'],
    ['Decision Trees','Ensemble Learning','pre'],['Unsupervised Learning','Clustering','pre'],['Unsupervised Learning','Dimensionality Reduction','pre'],
    ['Unsupervised Learning','Self-Supervised Learning','pre'],['Feature Engineering','Supervised Learning','rel'],['Dimensionality Reduction','Embeddings','pre'],
    ['Supervised Learning','Perceptron','pre'],['Reinforcement Learning','RLHF','pre'],['Ensemble Learning','Search and Recommendation','rel'],

    ['Perceptron','Backpropagation','pre'],['Backpropagation','Convolutional Networks','pre'],['Backpropagation','Recurrent Networks','pre'],
    ['Activation Functions','Perceptron','pre'],['Normalization','Residual Connections','rel'],['Residual Connections','Transformer','pre'],
    ['Convolutional Networks','Computer Vision','pre'],['Recurrent Networks','Attention','pre'],['Attention','Transformer','pre'],
    ['Transformer','Pretraining','pre'],['Embeddings','Attention','pre'],['Embeddings','Vector Databases','pre'],
    ['Self-Supervised Learning','Pretraining','pre'],['Generative Adversarial Networks','Diffusion Models','pre'],['Diffusion Models','Multimodality','pre'],
    ['Convolutional Networks','Generative Adversarial Networks','pre'],['Graph Neural Networks','Protein Structure','pre'],['Normalization','Transformer','pre'],
    ['Activation Functions','Transformer','pre'],['Recurrent Networks','Machine Translation','pre'],['Attention','Machine Translation','pre'],

    ['Pretraining','Scaling Laws','pre'],['Pretraining','Instruction Tuning','pre'],['Pretraining','Tokenization','pre'],
    ['Transformer','Positional Encoding','pre'],['Positional Encoding','Long Context','pre'],['Context Window','Long Context','pre'],
    ['Instruction Tuning','Chain of Thought','pre'],['Instruction Tuning','RLHF','pre'],['Instruction Tuning','LoRA','rel'],
    ['LoRA','Inference Serving','rel'],['Transformer','Mixture of Experts','pre'],['Mixture of Experts','Distributed Training','rel'],
    ['Attention','KV Cache','pre'],['KV Cache','Inference Serving','pre'],['KV Cache','Speculative Decoding','rel'],
    ['Quantization','Inference Serving','pre'],['Chain of Thought','Agents','pre'],['Tool Calling','Agents','pre'],
    ['Retrieval Augmentation','Agents','pre'],['Instruction Tuning','Tool Calling','pre'],['Embeddings','Retrieval Augmentation','pre'],
    ['Vector Databases','Retrieval Augmentation','pre'],['Retrieval Augmentation','Hallucination','rel'],['Long Context','FlashAttention','rel'],
    ['Multimodality','Computer Vision','rel'],['Scaling Laws','Distributed Training','pre'],['Context Window','KV Cache','rel'],
    ['Agents','Code Generation','pre'],['Multimodality','Agents','rel'],

    ['GPU Architecture','CUDA','pre'],['GPU Architecture','Tensor Cores','pre'],['GPU Architecture','Memory Bandwidth','pre'],
    ['CUDA','Operator Fusion','pre'],['CUDA','FlashAttention','pre'],['Tensor Cores','Mixed Precision','pre'],
    ['Memory Bandwidth','FlashAttention','pre'],['Memory Bandwidth','Quantization','pre'],['Memory Bandwidth','Batch Scheduling','pre'],
    ['Distributed Training','Data Parallelism','pre'],['Distributed Training','Tensor Parallelism','pre'],['Distributed Training','Pipeline Parallelism','pre'],
    ['Data Parallelism','ZeRO','pre'],['Operator Fusion','Compiler Optimization','pre'],['Compiler Optimization','Inference Serving','pre'],
    ['Batch Scheduling','Inference Serving','pre'],['Mixed Precision','Distributed Training','rel'],['GPU Architecture','Inference Serving','rel'],
    ['FlashAttention','Long Context','pre'],

    ['Reward Models','RLHF','pre'],['RLHF','DPO','rel'],['Instruction Tuning','DPO','pre'],
    ['RLHF','Evaluation Benchmarks','rel'],['Hallucination','Evaluation Benchmarks','rel'],['Interpretability','Red Teaming','rel'],
    ['Red Teaming','Jailbreaks and Defense','pre'],['Jailbreaks and Defense','Evaluation Benchmarks','rel'],['Interpretability','Hallucination','rel'],
    ['Pretraining','Hallucination','pre'],['Attention','Interpretability','pre'],

    ['Code Generation','Tool Calling','rel'],['Search and Recommendation','Vector Databases','pre'],['Computer Vision','Autonomous Driving','pre'],
    ['Reinforcement Learning','Autonomous Driving','rel'],['Speech Recognition','Multimodality','pre'],['Scientific Computing','Diffusion Models','rel'],
    ['Protein Structure','Scientific Computing','rel'],['Machine Translation','Search and Recommendation','rel'],['Evaluation Benchmarks','Code Generation','rel'],
  ],
};

export const DECKS = [MARINE, CELL, AI];

/* Deterministic deck choice from a filename: djb2 hash mod deck count.
   Same name → same deck, every time. */
export function pickDeck(filename = '') {
  let h = 5381;
  for (let i = 0; i < filename.length; i++) h = ((h << 5) + h + filename.charCodeAt(i)) | 0;
  return DECKS[Math.abs(h) % DECKS.length];
}

export const DEFAULT_DECK = MARINE;
