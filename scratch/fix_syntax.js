const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/ProjectProcessPanel.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const target = `                            onUpdateTask={(id, fields) => {
                                let foundStageId = null;
                                for (const stage of allStages) {
                                    if (project.tests?.[stage.id]?.find(t => t.id === id)) {
                                        foundStageId = stage.id;
                                                                   onAddTask={(stageId, taskName) => handleAddTest(stageId, null, taskName)}`;

const replacement = `                            onUpdateTask={(id, fields) => {
                                let foundStageId = null;
                                for (const stage of allStages) {
                                    if (project.tests?.[stage.id]?.find(t => t.id === id)) {
                                        foundStageId = stage.id;
                                        break;
                                    }
                                }
                                if (foundStageId) handleUpdateTestDetail(foundStageId, id, fields);
                            }}
                            onDeleteTask={(id) => {
                                let foundStageId = null;
                                for (const stage of allStages) {
                                    if (project.tests?.[stage.id]?.find(t => t.id === id)) {
                                        foundStageId = stage.id;
                                        break;
                                    }
                                }
                                if (foundStageId) removeTest(foundStageId, id);
                            }}
                            onAddTask={(stageId, taskName) => handleAddTest(stageId, null, taskName)}`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Successfully replaced the target content!");
} else {
    console.log("Target content not found. Let's inspect the file directly.");
    const index = content.indexOf('onUpdateTask={(id, fields) => {');
    if (index !== -1) {
        console.log("Found start of onUpdateTask at index:", index);
        console.log("Subsequent 300 chars:", content.substring(index, index + 300));
    }
}
