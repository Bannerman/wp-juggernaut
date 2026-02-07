#!/usr/bin/env bash
#
# MAIA Framework Status Tool
# Reports the current progress of Phase 1 steps for a MAIA project.
#
# Usage: ./scripts/maia-status.sh
#

set -euo pipefail

# --- Configuration ---
PROJECT_MANIFEST="project-manifest.yaml"
# --- End Configuration ---

# Check if project manifest exists
if [ ! -f "$PROJECT_MANIFEST" ]; then
    echo "Error: Project manifest '$PROJECT_MANIFEST' not found." >&2
    echo "This script must be run from the root of a MAIA project." >&2
    exit 1
fi

# Parse project name
PROJECT_NAME=$(grep "projectName:" "$PROJECT_MANIFEST" | head -n 1 | awk '{print $2}')
PROJECT_STATUS=$(grep "projectStatus:" "$PROJECT_MANIFEST" | head -n 1 | awk '{print $2}')

echo "--- MAIA Project Status: $PROJECT_NAME ---"
echo "Overall Project Status: $PROJECT_STATUS"
echo ""
echo "Phase 1 Progress:"

# Read phase1Progress section using awk to handle multi-line YAML
# and sed to remove quotes from keys/values if present
awk '
/^phase1Progress:/ {in_progress_section=1; next}
/^[a-zA-Z0-9_]+:/ {in_progress_section=0} # End of phase1Progress if next top-level key encountered

in_progress_section {
    if ($0 ~ /status:/) {
        gsub(/^[[:space:]]*status:[[:space:]]*/, "");
        gsub(/"/, ""); # Remove quotes
        status = $0;
        printf "  %s: %-15s", step_name, status;
    } else if ($0 ~ /timestamp:/) {
        gsub(/^[[:space:]]*timestamp:[[:space:]]*/, "");
        gsub(/"/, ""); # Remove quotes
        timestamp = $0;
        printf " (Last Updated: %s)\n", (timestamp == "" ? "N/A" : timestamp);
    } else if ($0 ~ /^[[:space:]]*p1_[0-9]{2}_[^:]+:/) {
        # This is a step name
        step_name = $1;
        gsub(/:/, "", step_name);
    } else if ($0 ~ /^[[:space:]]*overall:/) {
        step_name = $1;
        gsub(/:/, "", step_name);
    }
}
' "$PROJECT_MANIFEST" | sed 's/^- //' # Remove leading dashes if any


# Calculate completion percentage
TOTAL_STEPS=7 # p1_01 to p1_07
COMPLETED_STEPS=$(grep -c "status: completed" "$PROJECT_MANIFEST" || true) # Use || true to prevent error if grep finds nothing

PERCENTAGE=0
if [ "$TOTAL_STEPS" -gt 0 ]; then
    PERCENTAGE=$(( (COMPLETED_STEPS * 100) / TOTAL_STEPS ))
fi

echo ""
echo "Phase 1 Completion: $COMPLETED_STEPS/$TOTAL_STEPS steps ($PERCENTAGE%)"

# --- Next Steps Guidance (Basic) ---
echo ""
echo "Next Recommended Action:"

# Find the first pending step using awk to handle multi-line YAML
NEXT_PENDING_STEP=$(awk '
/^phase1Progress:/ {in_progress_section=1; next}
/^[a-zA-Z0-9_]+:/ {in_progress_section=0} 

in_progress_section {
    if ($0 ~ /^[[:space:]]*p1_[0-9]{2}_[^:]+:/) {
        current_step = $1;
        gsub(/:/, "", current_step);
    }
    if ($0 ~ /status:[[:space:]]*pending/ && current_step != "") {
        print current_step;
        exit;
    }
}
' "$PROJECT_MANIFEST")

NEXT_STEP_PROMPT=""
NEXT_STEP_DESCRIPTION=""

if [[ "$NEXT_PENDING_STEP" == "p1_01_ingest_kickstart" ]]; then
    NEXT_STEP_PROMPT="p1_01_ingest_kickstart.md"
    NEXT_STEP_DESCRIPTION="Ingest your project's kickstart.md to create the initial project-manifest.yaml."
elif [[ "$NEXT_PENDING_STEP" == "p1_02_select_tech_stack" ]]; then
    NEXT_STEP_PROMPT="p1_02_select_tech_stack.md"
    NEXT_STEP_DESCRIPTION="Select the technology stack for your project."
elif [[ "$NEXT_PENDING_STEP" == "p1_03_generate_requirements" ]]; then
    NEXT_STEP_PROMPT="p1_03_generate_requirements.md"
    NEXT_STEP_DESCRIPTION="Generate detailed functional and non-functional requirements."
elif [[ "$NEXT_PENDING_STEP" == "p1_04_generate_coding_standards" ]]; then
    NEXT_STEP_PROMPT="p1_04_generate_coding_standards.md"
    NEXT_STEP_DESCRIPTION="Generate project-specific coding standards."
elif [[ "$NEXT_PENDING_STEP" == "p1_05_create_personas_journeys" ]]; then
    NEXT_STEP_PROMPT="p1_05_create_personas_journeys.md"
    NEXT_STEP_DESCRIPTION="Define user personas and map their key user journeys."
elif [[ "$NEXT_PENDING_STEP" == "p1_06_create_user_stories" ]]; then
    NEXT_STEP_PROMPT="p1_06_create_user_stories.md"
    NEXT_STEP_DESCRIPTION="Generate detailed user stories based on personas and journeys."
elif [[ "$NEXT_PENDING_STEP" == "p1_07_specify_module" ]]; then
    NEXT_STEP_PROMPT="p1_07_specify_module.md"
    NEXT_STEP_DESCRIPTION="Specify your project's modules, one by one."
else
    NEXT_STEP_DESCRIPTION="All Phase 1 steps are completed! Your project blueprint is ready."
fi

if [ -n "$NEXT_STEP_PROMPT" ]; then
    echo "  Run the AI agent with prompt: prompts/$NEXT_STEP_PROMPT"
    echo "  Objective: $NEXT_STEP_DESCRIPTION"
else
    echo "  $NEXT_STEP_DESCRIPTION"
fi

echo ""
echo "For detailed guidance on each step, refer to the corresponding prompt file in the 'prompts/' directory."
