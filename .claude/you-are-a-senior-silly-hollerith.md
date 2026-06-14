# Cinematification Engine: Technical Architecture Document

## 1. High-Level Architecture

### Architecture Overview
The Cinematification Engine transforms narrative prose into screenplay-style structured output through a layered, deterministic pipeline. The system emphasizes traceability, modularity, and offline operation.

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│   Input Layer   │───▶│  Parsing Layer   │───▶│    NLP Layer       │
│ (File Formats)  │    │ (Text Structure) │    │ (Semantic Analysis)│
└─────────────────┘    └──────────────────┘    └────────────────────┘
                                      │
                                      ▼
                           ┌────────────────────┐
                           │ Metadata Layer     │
                           │ (Scene, Char, etc.)│
                           └────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌─────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ Storage Layer   │◀───────│ Synchronization  │◀───────│   Export Layer   │
│ (JSON/SQLite)   │        │   System         │        │ (Formats)        │
└─────────────────┘        └──────────────────┘        └──────────────────┘
```

### Component Interactions

1. **Input Layer**: Accepts various file formats (TXT, PDF, EPUB, DOCX) and extracts raw text with OCR fallback.
2. **Parsing Layer**: Performs sentence/paragraph segmentation, dialogue detection, and initial structural analysis.
3. **NLP Layer**: Applies Named Entity Recognition (NER), Part-of-Speech (POS) tagging, dependency parsing, and coreference resolution.
4. **Metadata Layer**: Generates scene, character, location, temporal, emotional, and sensory metadata.
5. **Storage Layer**: Persists processed data in JSON and SQLite formats for querying and retrieval.
6. **Synchronization Layer**: Maintains bidirectional mapping between original text positions and processed output.
7. **Export Layer**: Outputs structured data in multiple formats (JSON, XML, Fountain, CSV) for downstream consumption.

All processing is deterministic and offline, with no external API calls.

## 2. Processing Pipeline

### Preprocessing Stage
```python
def preprocess_text(raw_text: str) -> str:
    # 1. Unicode normalization
    text = normalize_unicode(raw_text)
    
    # 2. Artifact removal (page numbers, headers/footers)
    text = remove_ocr_artifacts(text)
    
    # 3. Quote normalization
    text = normalize_quotes(text)
    
    # 4. Ligature and special character handling
    text = expand_ligatures(text)
    
    return text
```

### Sentence and Paragraph Segmentation
- **Sentence Boundary Detection**: Uses heuristic rules for abbreviations (e.g., "Mr.", "Dr."), decimals, and ellipses.
- **Paragraph Reconstruction**: Combines hard-wrapped lines using indentation cues and semantic coherence scoring.
- **Dialogue Detection**: Identifies quotation patterns and attaches speaker labels when precedented by dialogue tags.

### Structural Parsing
#### Scene Detection Algorithm
```python
def detect_scenes(paragraphs: List[Paragraph]) -> List[Scene]:
    scenes = []
    current_scene = []
    
    for i, para in enumerate(paragraphs):
        # Scene boundary indicators
        if is_scene_break(para, i, paragraphs):
            if current_scene:
                scenes.append(create_scene_from_paragraphs(current_scene))
                current_scene = []
        current_scene.append(para)
    
    if current_scene:
        scenes.append(create_scene_from_paragraphs(current_scene))
    
    return scenes

def is_scene_break(para: Paragraph, index: int, paragraphs: List[Paragraph]) -> bool:
    # Heuristic-based scene break detection
    text = para.text.lower()
    
    # Explicit scene markers
    if any(marker in text for marker in ["CHAPTER ", "PART ", "SCENE "]):
        return True
    
    # Location change indicators
    location_shift = detect_location_shift(para, paragraphs[max(0, index-2):index+3])
    if location_shift:
        return True
        
    # Time progression indicators  
    time_shift = detect_time_shift(para, paragraphs[max(0, index-2):index+3])
    if time_shift:
        return True
        
    # Perspective change (sudden POV shift)
    perspective_shift = detect_perspective_shift(para, paragraphs[max(0, index-2):index+3])
    if perspective_shift:
        return True
        
    return False
```

### Character Tracking System
- **Character Registry**: Maintains canonical names, aliases, and appearance counts.
- **Alias Resolution**: Maps variations (e.g., "John", "Jon", "Jonathan") to canonical entities.
- **Appearance Tracking**: Records scene and paragraph-level presence.
- **Continuity Validation**: Ensures consistent character attributes across scenes.

### Location Tracking
- **Location Extraction**: Identifies place names through NER and gazetteer matching.
- **Canonicalization**: Normalizes variants (e.g., "NYC", "New York City", "New York").
- **Persistence Tracking**: Links locations to scenes and time periods.
- **Hierarchy Support**: Handles nested locations (e.g., "Paris, France" → "Paris" → "France").

### Temporal Tracking
- **Time Expression Parsing**: Recognizes explicit times ("3:00 PM"), vague times ("dawn", "midnight"), and relative times ("two hours later").
- **Chronology Assembly**: Orders scenes by detected temporal markers.
- **Duration Estimation**: Infers scene length from action density and dialogue length.
- **Timeline Generation**: Produces scene sequence with temporal offsets.

## 3. NLP Component Design

### spaCy Integration
```python
# Model selection: en_core_web_sm for balance of speed/accuracy
nlp = spacy.load("en_core_web_sm")

def extract_entities(text: str) -> Dict[str, List[Entity]]:
    doc = nlp(text)
    entities = {
        "PERSON": [],   # Characters
        "LOC": [],      # Locations
        "GPE": [],      # Geopolitical entities
        "FAC": []       # Facilities/buildings
    }
    
    for ent in doc.ents:
        if ent.label_ in entities:
            entities[ent.label_].append({
                "text": ent.text,
                "start": ent.start_char,
                "end": ent.end_char,
                "label": ent.label_
            })
    
    return entities

def get_pos_tags(text: str) -> List[Tuple[str, str]]:
    """Returns list of (token, POS_tag) tuples"""
    doc = nlp(text)
    return [(token.text, token.pos_) for token in doc]

def extract_dependencies(text: str) -> List[Dict]:
    """Extracts subject-verb-object triples for action detection"""
    doc = nlp(text)
    triples = []
    
    for token in doc:
        if token.dep_ == "ROOT" and token.pos_ == "VERB":
            subject = [child for child in token.children if child.dep_ in ("nsubj", "nsubjpass")]
            objects = [child for child in token.children if child.dep_ in ("dobj", "pobj", "attr")]
            
            for subj in subject:
                for obj in objects:
                    triples.append({
                        "subject": subj.text,
                        "verb": token.text,
                        "object": obj.text,
                        "sentiment": get_token_sentiment(token)
                    })
    
    return triples
```

### Coreference Resolution
Using a rule-based approach with spaCy and statistical heuristics:
```python
def resolve_coreferences(paragraphs: List[Paragraph]) -> List[Paragraph]:
    """Resolve pronouns to character entities"""
    character_registry = CharacterRegistry()
    
    for i, para in enumerate(paragraphs):
        doc = nlp(para.text)
        
        # Track character mentions in current paragraph
        current_mentions = extract_character_mentions(doc, character_registry)
        
        # Resolve pronouns
        resolved_text = para.text
        for token in doc:
            if token.pos_ == "PRON" and token.lemma_ in ("he", "she", "they", "him", "her", "them"):
                # Find most recent compatible antecedent
                antecedent = find_antecedent(token, i, paragraphs, character_registry)
                if antecedent:
                    resolved_text = resolved_text.replace(token.text, antecedent.canonical_name)
        
        para.text = resolved_text
        
        # Update registry with resolved mentions
        character_registry.update_mentions(para, i)
    
    return paragraphs
```

### Embedding Usage (Similarity Only)
```python
from sentence_transformers import SentenceTransformer
import numpy as np

# Local, offline embedding model
embedder = SentenceTransformer('all-MiniLM-L6-v2')

def compute_scene_similarity(scene1: Scene, scene2: Scene) -> float:
    """Cosine similarity between scene embeddings"""
    emb1 = embedder.encode(scene1.summary_text)
    emb2 = embedder.encode(scene2.summary_text)
    return np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))

def find_duplicate_scenes(scenes: List[Scene], threshold: float = 0.85) -> List[Tuple[Scene, Scene]]:
    """Detect semantically similar scenes"""
    duplicates = []
    embeddings = [embedder.encode(scene.summary_text) for scene in scenes]
    
    for i in range(len(embeddings)):
        for j in range(i+1, len(embeddings)):
            similarity = cosine_similarity([embeddings[i]], [embeddings[j]])[0][0]
            if similarity > threshold:
                duplicates.append((scenes[i], scenes[j]))
    
    return duplicates
```

## 4. Scene Detection System

### Deterministic Boundary Detection Algorithms

#### Setting Change Detection
```python
def detect_setting_change(current_para: Para, window: List[Para]) -> bool:
    setting_keywords = {
        "indoor": ["room", "house", "building", "office", "kitchen", "bedroom"],
        "outdoor": ["street", "park", "forest", "field", "mountain", "ocean"],
        "transition": ["entered", "arrived", "left", "departed", "reached"]
    }
    
    current_setting = classify_setting(current_para.text, setting_keywords)
    prev_setting = classify_setting(window[-2].text if len(window) >= 2 else "", setting_keywords)
    
    return current_setting != prev_setting and current_setting != "unknown"

def classify_setting(text: str, keywords: Dict[str, List[str]]) -> str:
    text_lower = text.lower()
    scores = {category: 0 for category in keywords}
    
    for category, words in keywords.items():
        for word in words:
            if word in text_lower:
                scores[category] += 1
    
    return max(scores, key=scores.get) if max(scores.values()) > 0 else "unknown"
```

#### Time Change Detection
```python
TIME_EXPRESSIONS = {
    "morning": ["dawn", "sunrise", "morning", "am", "a.m."],
    "day": ["noon", "midday", "afternoon", "pm", "p.m."],
    "evening": ["dusk", "sunset", "evening", "night"],
    "night": ["midnight", "late night", "dark"]
}

def detect_time_shift(current_para: Para, window: List[Para]) -> bool:
    current_time = extract_time_reference(current_para.text)
    prev_time = extract_time_reference(window[-2].text if len(window) >= 2 else "")
    
    return current_time != prev_time and current_time != "unknown"

def extract_time_reference(text: str) -> str:
    text_lower = text.lower()
    
    # Check for explicit time patterns
    import re
    time_pattern = r'\d{1,2}:\d{2}\s*(?:am|pm|a\.m\.|p\.m\.)?'
    if re.search(time_pattern, text_lower):
        return "explicit_time"
    
    # Check for time of day references
    for period, keywords in TIME_EXPRESSIONS.items():
        if any(keyword in text_lower for keyword in keywords):
            return period
    
    return "unknown"
```

### Scene Boundary Pseudocode
```
Algorithm: DetectScenes(paragraphs)
Input: List of processed paragraphs
Output: List of detected scenes with metadata

1. Initialize empty scenes list
2. Initialize current_scene as empty list
3. For each paragraph at index i in paragraphs:
   a. If is_scene_boundary(i, paragraphs):
        i. If current_scene not empty:
           - Create scene from current_scene paragraphs
           - Add scene to scenes list
           - Reset current_scene to empty list
   b. Add current paragraph to current_scene
4. After loop, if current_scene not empty:
   - Create final scene and add to scenes list
5. Return scenes list

Function: is_scene_boundary(index, paragraphs)
Input: Paragraph index, list of paragraphs
Output: Boolean indicating scene boundary

1. Get paragraph text at index
2. Check explicit markers (CHAPTER, PART, SCENE)
3. Check location shift in ±2 paragraph window
4. Check time shift in ±2 paragraph window  
5. Check perspective/POV shift in ±2 paragraph window
6. Return True if any check passes, else False
```

## 5. Dialogue Attribution System

### Speaker Attribution Rules

#### Explicit Dialogue Tags
Pattern: `"[dialogue]", [speaker] [verb]` or `[speaker] [verb], "[dialogue]"`

Examples:
- `"Hello world," John said.`
- `Mary whispered, "Be careful."`
- `"Come here!" shouted the captain.`

#### Implicit Dialogue Attribution
Rules:
1. Speaker from previous dialogue line continues until new speaker introduced
2. Paragraph containing only dialogue attributes to Last Known Speaker
3. Action paragraphs reset speaker context unless containing dialogue
4. New paragraph starting with quotes attributes to speaker from dialogue tag if present

### Multi-Speaker Conversation Handling
```python
def attribute_speakers(paragraphs: List[Paragraph]) -> List[Paragraph]:
    last_known_speaker = None
    speaker_queue = []  # For tracking rapid speaker changes
    
    for para in paragraphs:
        dialogue_quotes = extract_dialogue_quotes(para.text)
        
        if dialogue_quotes:
            # Check for explicit speaker tags
            explicit_speaker = extract_explicit_speaker(para.text)
            
            if explicit_speaker:
                speaker = explicit_speaker
                last_known_speaker = speaker
                speaker_queue.append(speaker)
            elif dialogue_quotes and len(dialogue_quotes) == 1:
                # Single dialogue quote - likely same speaker continues
                speaker = last_known_speaker or "UNKNOWN"
            else:
                # Multiple quotes or complex dialogue
                speakers = infer_multi_speaker(dialogue_quotes, para.text, last_known_speaker)
                speaker = speakers[0] if speakers else last_known_speaker
                # Update queue for alternating speakers
                speaker_queue.extend(speakers[1:]) if len(speakers) > 1 else None
                
                if speaker_queue and not explicit_speaker:
                    speaker = speaker_queue.pop(0)
            
            para.speaker = speaker
            para.dialogue_quotes = dialogue_quotes
        else:
            # Non-dialogue paragraph
            para.speaker = None  # Indicates narration/action
            # Only update last_known_speaker if para contains strong character cues
            if contains_character_reference(para.text):
                last_known_speaker = infer_speaker_from_action(para.text)
    
    return paragraphs
```

### Nested Dialogue Handling
- **Inner quotes**: Single quotes within double quotes indicate quoted speech
- **Thought representation**: Italic text or specific notation for internal monologue
- **Overlapping speech**: Special markers for simultaneous dialogue (rare in prose)

## 6. Metadata Generation System

### Scene Metadata Schema
```json
{
  "scene_id": "uuid",
  "slugline": "EXT. LOCATION - TIME",
  "location": {
    "raw": "string",
    "canonical": "string", 
    "confidence": 0.0-1.0
  },
  "time": {
    "raw": "string",
    "canonical": "string",
    "period": "morning/day/evening/night",
    "confidence": 0.0-1.0
  },
  "active_characters": [
    {
      "character_id": "uuid",
      "name": "string",
      "appearance_type": "speaking|present|mentioned"
    }
  ],
  "summary": "string",
  "word_count": integer,
  "dialogue_ratio": float,
  "action_density": float,
  "emotional_valence": float,
  "arousal_level": float
}
```

### Character Metadata Schema
```json
{
  "character_id": "uuid",
  "canonical_name": "string",
  "aliases": ["string"],
  "first_appearance": {
    "scene_id": "uuid",
    "paragraph_index": integer,
    "confidence": 0.0-1.0
  },
  "total_appearances": integer,
  "scene_presence": [
    {
      "scene_id": "uuid",
      "appearance_type": "speaking|present|mentioned",
      "dialogue_lines": integer,
      "word_count": integer
    }
  ],
  "character_arc": {
    "introduced": "scene_id",
    "major_changes": ["scene_id"],
    "final_state": "description"
  },
  "relationships": [
    {
      "target_character_id": "uuid",
      "relationship_type": "friend|family|rival|lover|enemy|colleague",
      "strength": 0.0-1.0,
      "first_interaction": "scene_id"
    }
  ]
}
```

### Emotional Metadata (Local Models Only)
Using VADER or DistilBERT sentiment models:
```python
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# Initialize local sentiment analyzer
sentiment_analyzer = SentimentIntensityAnalyzer()
# Alternative: Local DistilBERT model
# tokenizer = AutoTokenizer.from_pretrained("local/distilbert-sentiment")
# model = AutoModelForSequenceClassification.from_pretrained("local/distilbert-sentiment")

def analyze_emotional_content(text: str) -> Dict[str, float]:
    """Returns valence (-1 to 1) and arousal (0 to 1) scores"""
    # VADER approach
    scores = sentiment_analyzer.polarity_scores(text)
    valence = scores['compound']  # -1 (negative) to +1 (positive)
    
    # Approximate arousal from subjectivity and intensity
    arousal = 1.0 - abs(scores['neu'])  # Inverse of neutrality
    
    return {
        "valence": valence,
        "arousal": arousal,
        "positive": scores['pos'],
        "negative": scores['neg'],
        "neutral": scores['neu']
    }
```

### Sensory Metadata Detection
```python
SENSORY_LEXICONS = {
    "visual": ["saw", "looked", "appeared", "visible", "bright", "dark", "color", "light"],
    "auditory": ["heard", "sound", "noise", "quiet", "loud", "music", "voice", "echo"],
    "olfactory": ["smelled", "scent", "odor", "fragrance", "stench", "aroma"],
    "gustatory": ["tasted", "flavor", "sweet", "bitter", "sour", "salty", "delicious"],
    "tactile": ["felt", "touch", "texture", "hot", "cold", "rough", "smooth", "pain"]
}

def detect_sensory_cues(text: str) -> Dict[str, float]:
    text_lower = text.lower()
    scores = {}
    
    for sense, keywords in SENSORY_LEXICONS.items():
        count = sum(1 for keyword in keywords if keyword in text_lower)
        scores[sense] = min(count / len(keywords), 1.0)  # Normalize
    
    return scores
```

## 7. Storage Architecture

### JSON Schema for Scene Export
```json
{
  "metadata": {
    "title": "string",
    "author": "string",
    "total_scenes": "integer",
    "total_words": "integer",
    "processing_timestamp": "ISO string",
    "engine_version": "string"
  },
  "scenes": [
    {
      "scene_id": "uuid",
      "slugline": "string",
      "location": {
        "raw": "string",
        "canonical": "string"
      },
      "time": {
        "raw": "string", 
        "canonical": "string"
      },
      "active_characters": [
        {
          "character_id": "uuid",
          "name": "string",
          "appearance": "speaking|present|mentioned"
        }
      ],
      "content": {
        "narration": ["string"],
        "dialogue": [
          {
            "speaker": "string",
            "text": "string"
          }
        ],
        "action": ["string"]
      },
      "metadata": {
        "word_count": "integer",
        "dialogue_ratio": "float",
        "emotional_valence": "float",
        "sensory_cues": {
          "visual": "float",
          "auditory": "float",
          // ... other senses
        }
      }
    }
  ],
  "characters": {
    "character_id": {
      "canonical_name": "string",
      "aliases": ["string"],
      "first_appearance": "scene_id",
      "total_appearances": "integer"
    }
  }
}
```

### SQLite Schema
```sql
CREATE TABLE documents (
    doc_id TEXT PRIMARY KEY,
    title TEXT,
    author TEXT,
    total_words INTEGER,
    processed_at TIMESTAMP
);

CREATE TABLE scenes (
    scene_id TEXT PRIMARY KEY,
    doc_id TEXT,
    scene_index INTEGER,
    slugline TEXT,
    location_raw TEXT,
    location_canonical TEXT,
    time_raw TEXT,
    time_canonical TEXT,
    word_count INTEGER,
    FOREIGN KEY (doc_id) REFERENCES documents(doc_id)
);

CREATE TABLE scene_characters (
    scene_id TEXT,
    character_id TEXT,
    appearance_type TEXT,  -- speaking, present, mentioned
    PRIMARY KEY (scene_id, character_id),
    FOREIGN KEY (scene_id) REFERENCES scenes(scene_id),
    FOREIGN KEY (character_id) REFERENCES characters(character_id)
);

CREATE TABLE characters (
    character_id TEXT PRIMARY KEY,
    canonical_name TEXT,
    first_scene TEXT,
    total_appearances INTEGER,
    FOREIGN KEY (first_scene) REFERENCES scenes(scene_id)
);

CREATE TABLE scene_metadata (
    scene_id TEXT PRIMARY KEY,
    dialogue_ratio REAL,
    emotional_valence REAL,
    emotional_arousal REAL,
    FOREIGN KEY (scene_id) REFERENCES scenes(scene_id)
);

CREATE TABLE sensory_metadata (
    scene_id TEXT,
    sense_type TEXT,  -- visual, auditory, etc.
    strength REAL,
    PRIMARY KEY (scene_id, sense_type),
    FOREIGN KEY (scene_id) REFERENCES scenes(scene_id)
);

CREATE TABLE embeddings (
    scene_id TEXT,
    embedding_vector BLOB,  -- Serialized float array
    model_version TEXT,
    FOREIGN KEY (scene_id) REFERENCES scenes(scene_id)
);
```

### Vector Storage Schema (for similarity search)
Using FAISS or ChromaDB local:
- **Collection**: `scene_embeddings`
- **Vector dimension**: 384 (for all-MiniLM-L6-v2)
- **Metadata stored**: scene_id, location, time, word_count, emotional_valence
- **Index type**: IVFFlat for efficient similarity search

### Character Registry Schema
```json
{
  "character_id": "uuid",
  "canonical_name": "string",
  "aliases": ["string"],
  "first_mention": {
    "text_snippet": "string",
    "offset": integer,
    "confidence": 0.0-1.0
  },
  "appearance_count": integer,
  "last_seen": {
    "scene_id": "uuid",
    "offset": integer
  },
  "traits": {
    "gender": "string|null",
    "age_range": "string|null",
    "occupation": "string|null"
  }
}
```

## 8. Synchronization System

### Offset Mapping Design
Maintains bidirectional mapping between:
- Original text character offsets
- Processed sentence/paragraph offsets  
- Generated scene/speech offsets
- Metadata references

```python
class OffsetMapper:
    def __init__(self):
        # Original text -> Processed elements
        self.original_to_processed = {}
        # Processed elements -> Original text  
        self.processed_to_original = {}
        # Scene ID -> Original span
        self.scene_to_original = {}
        # Character mention -> Original span
        self.character_mentions = defaultdict(list)
    
    def add_mapping(self, original_start: int, original_end: int, 
                   processed_element: str, element_type: str):
        """Record bidirectional mapping"""
        key = f"{element_type}:{len(self.original_to_processed)}"
        self.original_to_processed[(original_start, original_end)] = key
        self.processed_to_original[key] = (original_start, original_end)
    
    def map_original_to_scene(self, char_offset: int) -> Optional[str]:
        """Find which scene contains this character offset"""
        for (start, end), element_key in self.original_to_processed.items():
            if start <= char_offset <= end:
                # Traverse up to find scene containing this element
                return self._find_containing_scene(element_key)
        return None
    
    def get_original_span(self, scene_id: str) -> Optional[Tuple[int, int]]:
        """Get original text span for a scene"""
        return self.scene_to_original.get(scene_id)
```

### Supported Use Cases
1. **Side-by-Side View**: Show original text alongside cinematified version
2. **Traceability Click**: Click scene in output → highlights original text
3. **Round-trip Editing**: Edit cinematified version → map changes back to original
4. **Annotation Export**: Export annotations with original text references
5. **Search Synchronization**: Search in processed → highlight in original

## 9. Performance Optimization

### Memory Usage Optimization
- **Streaming Processing**: Process paragraphs incrementally rather than loading entire document
- **Lazy Embedding Generation**: Compute embeddings only when needed for similarity search
- **Object Pooling**: Reuse spaCy Doc objects where possible
- **Memory Mapping**: For large files, use memory-mapped file access

### Incremental Processing
```python
class IncrementalProcessor:
    def __init__(self, checkpoint_dir: str):
        self.checkpoint_dir = checkpoint_dir
        self.processed_scenes = set()
        
    def process_document_incrementally(self, file_path: str):
        # Load checkpoint if exists
        checkpoint = self.load_latest_checkpoint()
        start_scene = checkpoint.last_processed_scene if checkpoint else 0
        
        # Extract text and segment into paragraphs
        paragraphs = self.extract_and_segment(file_path)
        
        # Process from checkpoint
        for i in range(start_scene, len(paragraphs)):
            scene = self.process_scene_batch(paragraphs[i:i+SCENE_BATCH_SIZE])
            self.save_checkpoint(i + SCENE_BATCH_SIZE, scene)
            
    def save_checkpoint(self, scene_index: int, scene_data: Scene):
        # Save only new/changed data
        checkpoint_data = {
            "last_processed_scene": scene_index,
            "scene_data": scene_data.to_dict(),
            "timestamp": time.time()
        }
        # Atomic write to prevent corruption
        self._atomic_write_checkpoint(checkpoint_data)
```

### Parallel Processing Strategies
- **Paragraph-level Parallelism**: Different CPU cores process different paragraphs
- **Scene-batch Parallelism**: Independent scene processing (after dependency resolution)
- **Embedding Computation**: Parallel encoding of scene summaries
- **Metadata Generation**: Independent computation of different metadata types

```python
from concurrent.futures import ProcessPoolExecutor
import multiprocessing as mp

def parallel_process_scenes(paragraph_batches: List[List[Paragraph]]) -> List[Scene]:
    with ProcessPoolExecutor(max_workers=mp.cpu_count()) as executor:
        futures = [
            executor.submit(process_scene_batch, batch) 
            for batch in paragraph_batches
        ]
        scenes = [future.result() for future in as_completed(futures)]
    return sorted(scenes, key=lambda s: s.batch_index)  # Reorder by original sequence
```

### Caching Strategy
- **LRU Cache**: For frequently accessed character/location data
- **Embedding Cache**: Store computed embeddings with content-based keys
- **Rule Evaluation Cache**: Cache results of expensive regex/rule evaluations
- **Persistence Layer**: SQLite database serves as persistent cache between sessions

### Embedding Optimization
- **Quantization**: Reduce embedding precision from float32 to float16/int8
- **Product Quantization**: For large-scale similarity search (FAISS)
- **Approximate Nearest Neighbor**: Trade slight accuracy for massive speed gains
- **Batch Processing**: Encode multiple texts simultaneously for GPU/CPU efficiency

## 10. Plugin Architecture

### Core Interfaces
```python
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

class TextProcessor(ABC):
    """Interface for text transformation plugins"""
    
    @abstractmethod
    def process(self, text: str, context: Dict[str, Any]) -> str:
        """Transform input text, return processed text"""
        pass
    
    @abstractmethod
    def get_metadata(self) -> Dict[str, Any]:
        """Return plugin metadata (name, version, dependencies)"""
        pass

class NLPModule(ABC):
    """Interface for NLP enhancement plugins"""
    
    @abstractmethod
    def analyze(self, text: str) -> Dict[str, Any]:
        """Analyze text and return structured insights"""
        pass
    
    @abstractmethod
    def get_required_resources(self) -> List[str]:
        """Return list of required model/data files"""
        pass

class ExportFormatter(ABC):
    """Interface for export format plugins"""
    
    @abstractmethod
    def format(self, scenes: List[Scene], characters: Dict[str, Character]) -> str:
        """Format processed data into target format"""
        pass
    
    @abstractmethod
    def get_file_extension(self) -> str:
        """Return file extension for this format"""
        pass

class MetadataGenerator(ABC):
    """Interface for metadata generation plugins"""
    
    @abstractmethod
    def generate(self, scene: Scene, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate metadata for a scene"""
        pass
```

### Plugin Lifecycle
1. **Discovery**: Scan `plugins/` directory for valid plugin modules
2. **Loading**: Dynamically import and instantiate plugin classes
3. **Validation**: Check dependencies and resource availability
4. **Execution**: Integrate into processing pipeline at defined extension points
5. **Configuration**: Load plugin-specific settings from config files

### Extension Points
- **Preprocessing**: Custom text normalization/cleaning rules
- **Parsing**: Alternative sentence/paragraph segmentation strategies
- **NER**: Custom entity types or domain-specific gazetteers
- **Scene Detection**: Additional boundary detection heuristics
- **Dialogue**: Specialized attribution rules for genres/formats
- **Metadata**: Custom scene/character metadata generation
- **Export**: Additional output formats (PDF, HTML, specialized JSON)

### Plugin Manifest Example
```json
{
  "name": "historical_dialogue_plugin",
  "version": "1.0.0",
  "description": "Enhanced dialogue attribution for historical fiction",
  "dependencies": ["spacy>=3.0.0"],
  "entry_point": "historical_dialogue.HistoricalDialogueProcessor",
  "assets": ["gazetteers/historical_titles.json", "rules/archaic_verbs.yaml"],
  "hook_points": ["preprocessing", "dialogue_attribution"],
  "configuration": {
    "formality_threshold": 0.7,
    "title_detection": true
  }
}
```

## 11. Technology Recommendations

### Primary Language: Python 3.9+
**Justification:**
- Excellent NLP library ecosystem (spaCy, NLTK, Stanza, sentence-transformers)
- Strong performance characteristics for text processing
- Excellent cross-platform support (Windows, macOS, Linux)
- Rich plugin system capabilities via importlib
- Mature serialization (JSON, pickle) and database (SQLite) support
- Large developer community and extensive documentation

### Framework Choices
- **NLP Core**: spaCy (efficient, production-ready, excellent documentation)
- **Sentence Embeddings**: sentence-transformers (local, offline, multiple model options)
- **Vector Search**: FAISS (Facebook's library, optimized for similarity search) or ChromaDB (local, embedded)
- **Database**: SQLite (zero-config, ACID compliant, single-file, excellent performance)
- **Parallel Processing**: concurrent.futures, multiprocessing (built-in, no external deps)
- **Configuration**: Pydantic (validation) + yaml/json files
- **Plugin System**: importlib + setuptools entry points (standard Python approach)
- **Testing**: pytest (comprehensive, widely adopted)
- **Type Hints**: mypy (static analysis, improves maintainability)

### Library Selection Criteria
1. **Offline Capability**: Must work without internet after initial installation
2. **Deterministic Behavior**: Fixed seed models where applicable, rule-based fallbacks
3. **License Compatibility**: Permissive licenses (MIT, Apache, BSD) preferred
4. **Maintenance Status**: Actively maintained, good documentation
5. **Performance**: Benchmarked for target use cases (100k-500k word documents)
6. **Cross-platform**: Wheels available for major platforms

### Specific Recommendations
- **spaCy**: `en_core_web_sm` model (balance of size/accuracy, ~50MB)
- **Sentence Transformers**: `all-MiniLM-L6-v2` (384-dim, fast, good quality)
- **FAISS**: For vector similarity search when needed
- **python-docx**: For DOCX text extraction
- **PyPDF2/pdfplumber**: For PDF text extraction (with OCR fallback via pytesseract + tesseract-ocr)
- **ebooklib**: For EPUB processing
- **python-pptx**: For PPTX text extraction
- **pydantic**: For data validation and settings management
- **rich**: For improved CLI/output formatting (optional)
- **loguru**: For structured logging (optional)

### Tradeoffs Considered
- **Accuracy vs Speed**: Choosing sm models over lg/trf models for better throughput
- **Feature Richness vs Simplicity**: Prioritizing core deterministic features over experimental ML
- **Development Velocity vs Performance**: Using Python despite some performance cost for ecosystem benefits
- **External Dependencies vs Bundling**: Accepting manageable dependency count for quality libraries

## 12. Project Structure
```
cinematification-engine/
│
├── src/                          # Source code
│   ├── __init__.py
│   │
│   ├── core/                     # Core engine components
│   │   ├── pipeline.py           # Main processing orchestrator
│   │   ├── offset_mapper.py      # Synchronization system
│   │   └── plugins/              # Plugin management system
│   │       ├── manager.py
│   │       ├── interfaces.py
│   │       └── registry.py
│   │
│   ├── nlp/                      # NLP modules and wrappers
│   │   ├── spacy_wrapper.py      # spaCy integration layer
│   │   ├── coreference.py        # Coreference resolution
│   │   ├── embeddings.py         # Embedding generation and caching
│   │   └── sentiment.py          # Local sentiment analysis
│   │
│   ├── processing/               # Text processing pipeline stages
│   │   ├── preprocessing.py      # Text cleaning and normalization
│   │   ├── segmentation.py       # Sentence/paragraph splitting
│   │   ├── dialogue.py           # Dialogue detection and attribution
│   │   ├── structure.py          # Scene/chapter/beat detection
│   │   └── metadata.py           # Metadata generation systems
│   │
│   ├── storage/                  # Data persistence systems
│   │   ├── json_handler.py       # JSON import/export
│   │   ├── sqlite_handler.py     # SQLite database interface
│   │   ├── vector_store.py       # FAISS/ChromaDB integration
│   │   └── schemas.py            # Database and JSON schemas
│   │
│   ├── export/                   # Export format plugins
│   │   ├── json_exporter.py
│   │   ├── fountain_exporter.py  # Fountain screenplay format
│   │   ├── xml_exporter.py
│   │   └── html_exporter.py
│   │
│   └── utils/                    # Utility functions and helpers
│       ├── logging.py
│       ├── config.py
│       ├── types.py              # Type definitions and data classes
│       └── constants.py
│
├── plugins/                      # User-contributed plugins
│   ├── example_dialogue_plugin/
│   │   ├── __init__.py
│   │   ├── plugin.json
│   │   └── processor.py
│   │
│   └── historical_nlp/
│       ├── __init__.py
│       ├── plugin.json
│       └── analyzer.py
│
├── tests/                        # Test suite
│   ├── unit/
│   │   ├── test_preprocessing.py
│   │   ├── test_nlp.py
│   │   └── test_storage.py
│   │
│   ├── integration/
│   │   ├── test_pipeline.py
│   │   └── test_plugins.py
│   │
│   └── fixtures/                 # Test data
│       ├── sample_texts/
│       └── expected_outputs/
│
├── docs/                         # Documentation
│   ├── architecture.md           # This document
│   ├── user_guide.md
│   ├── api_reference.md
│   └── plugin_development.md
│
├── configs/                      # Configuration files
│   ├── default.yaml
│   ├── logging.yaml
│   └── plugins/
│
├── data/                         # Data files (gazetteers, lexicons, etc.)
│   ├── gazetteers/
│   │   ├── locations.txt
│   │   └── character_titles.txt
│   │
│   ├── lexicons/
│   │   ├── sentiment/
│   │   ├── sensory/
│   │   └── temporal/
│   │
│   └── models/                   # Local models (spaCy, sentence-transformers)
│       ├── spacy/
│       │   └── en_core_web_sm/
│       │
│       └── sentence-transformers/
│           └── all-MiniLM-L6-v2/
│
├── requirements.txt              # Python dependencies
├── setup.py                      # Package installation
├── README.md                     # Project overview
└── LICENSE                       # MIT License
```

## 13. Development Roadmap

### Phase 1: Minimum Viable Engine
**Goal**: Basic narrative-to-screenplay transformation with core structure preservation.

**Deliverables:**
- Basic text ingestion (TXT, PDF via PyPDF2)
- Sentence and paragraph segmentation
- Simple scene detection (heuristic-based on whitespace/chapters)
- Dialogue detection with basic attribution
- Character and location extraction (regex + basic NLP)
- JSON export format with scene/speech structure
- Basic synchronization (offset mapping)
- CLI interface for processing files

**Dependencies:**
- Python 3.9+
- PyPDF2, regex, tqdm (for progress)
- Basic NLP: regex-only for entities (no spaCy yet)

**Estimated Complexity**: Low-Moderate
**Primary Risks**: 
- Over-simplistic scene detection missing nuanced transitions
- Dialogue attribution failures in complex conversations
- Memory issues with large documents

**Mitigation**:
- Implement incremental processing from start
- Use configurable heuristics with sane defaults
- Add memory profiling early

### Phase 2: NLP Enrichment
**Goal**: Integrate production-quality NLP for improved accuracy and metadata.

**Deliverables:**
- spaCy integration for NER, POS, dependency parsing
- Improved character tracking with alias resolution
- Basic coreference resolution (pronoun-to-character)
- Sentiment analysis using VADER or local DistilBERT
- Enhanced scene detection using linguistic cues
- Sentence embeddings for similarity-based deduplication
- SQLite storage layer for persistent data
- Improved export formats (JSON with richer metadata)

**Dependencies:**
- spacy==3.x.x
- sentence-transformers
- vaderSentiment or transformers (for DistilBERT)
- FAISS or ChromaDB for vector storage (optional in this phase)

**Estimated Complexity**: Moderate
**Primary Risks**:
- SpaCy model loading time/memory usage
- Coreference resolution quality limitations
- Embedding computation performance

**Mitigation**:
- Lazy load models only when needed
- Implement model caching
- Use streaming/batch processing for embeddings
- Fallback to rule-based methods when NLP unavailable

### Phase 3: Metadata Expansion
**Goal**: Comprehensive metadata generation for rich scene understanding.

**Deliverables:**
- Full character lifecycle tracking (first appearance, arcs, relationships)
- Location hierarchy and persistence tracking
- Temporal chronology assembly and timeline generation
- Emotional metadata (valence, arousal) per scene
- Sensory modality detection (visual, auditory, etc.)
- Scene summary generation (extractive)
- Relationship inference (character co-occurrence, dialogue)
- Advanced export formats (Fountain screenplay, XML)
- Plugin system foundation (basic interface)

**Dependencies:**
- Enhanced gazetteers and lexicons (custom TXT/JSON files)
- Optional: NetworkX for relationship graph analysis

**Estimated Complexity**: Moderate-High
**Primary Risks**:
- Complex metadata becoming difficult to maintain
- Relationship inference accuracy
- Storage schema evolution complexity

**Mitigation**:
- Start with simple metadata, expand iteratively
- Use JSON-flexible schemas initially
- Implement schema migration scripts early
- Focus on most valuable metadata first (characters, locations)

### Phase 4: Performance Optimization
**Goal**: Scale to 500k+ word documents with responsive performance.

**Deliverables:**
- Incremental/checkpoint-based processing for large files
- Parallel processing pipeline (paragraph/scene level)
- Memory optimization (object pooling, streaming)
- Embedding quantization and caching strategies
- FAISS-based vector search for similarity operations
- Comprehensive caching (LRU, persistent)
- Performance profiling and benchmarking suite
- Configuration tuning guides

**Dependencies:**
- No new major dependencies (optimization of existing)
- Optional: GPU-accelerated embedding via sentence-transformers

**Estimated Complexity**: High
**Primary Risks**:
- Complexity of parallel processing bugs
- Cache coherence issues
- Diminishing returns on optimization efforts

**Mitigation**:
- Implement profiling early to identify bottlenecks
- Use immutable data structures where possible
- Start with thread-based parallelism before process-based
- Validate optimizations with real-world documents

### Phase 5: Plugin Ecosystem
**Goal**: Enable community extensibility and specialized adaptations.

**Deliverables:**
- Complete plugin architecture with well-defined interfaces
- Plugin discovery, loading, and lifecycle management
- Sample plugins (historical dialogue, sci-fi terminology, etc.)
- Plugin marketplace documentation and guidelines
- Configuration system for plugin parameters
- Plugin security sandboxing (basic)
- Example export formats (PDF, HTML, custom JSON)
- Comprehensive plugin development guide

**Dependencies:**
- setuptools for plugin entry points
- Optional: pluginframework library (if advanced features needed)

**Estimated Complexity**: Moderate
**Primary Risks**:
- Plugin interface design needing frequent revision
- Dependency conflicts between plugins
- Security concerns with third-party plugins

**Mitigation**:
- Define stable interfaces early, use semantic versioning
- Implement dependency isolation (virtual environments per plugin)
- Start with trusted plugin sources, add security later
- Focus on extensibility points with clear use cases

## Verification Approach
Each phase includes:
- Unit tests for individual components (>80% coverage target)
- Integration tests for pipeline stages
- Performance benchmarks with reference documents
- Comparisons against baseline (Phase 1 output)
- User acceptance testing with sample narratives
- Cross-platform validation (Windows, macOS, Linux)

## Success Metrics
- **Accuracy**: >90% scene boundary detection on test corpus
- **Performance**: <5 seconds processing time per 10k words (Phase 4 target)
- **Memory**: <500MB RAM usage for 500k word documents
- **Traceability**: 100% mappable offsets between original and output
- **Determinism**: Identical output for same input across runs
- **Extensibility**: Successful integration of 3+ community plugins
- **Usability**: CLI processing of arbitrary TXT/PDF with one command

## Conclusion
This architecture provides a comprehensive, production-ready foundation for the Cinematification Engine. By leveraging deterministic NLP techniques, incremental processing, and extensible design, the system meets all requirements for offline, scalable, transformation of narrative prose into screenplay-structured output while maintaining full traceability and explainability.

The phased approach allows for early delivery of valuable functionality while building toward the sophisticated, high-performance system needed for professional use cases.