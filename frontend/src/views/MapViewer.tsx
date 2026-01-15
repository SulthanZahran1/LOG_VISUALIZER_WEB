import { useEffect, useState } from 'preact/hooks';
import { MapCanvas } from '../components/map/MapCanvas';
import { FileUpload } from '../components/file/FileUpload';
import { RecentFiles } from '../components/file/RecentFiles';
import { uploadMapLayout, getRecentFiles, deleteFile, renameFile } from '../api/client';
import { fetchMapLayout, mapLayout } from '../stores/mapStore';
import type { FileInfo } from '../models/types';

export function MapViewer() {
    const [recentMaps, setRecentMaps] = useState<FileInfo[]>([]);

    const loadRecentMaps = async () => {
        try {
            const files = await getRecentFiles();
            // Filter for XML files
            setRecentMaps(files.filter(f => f.name.toLowerCase().endsWith('.xml')));
        } catch (err) {
            console.error('Failed to load recent maps', err);
        }
    };

    useEffect(() => {
        loadRecentMaps();
    }, []);

    const handleUploadSuccess = async () => {
        await fetchMapLayout();
        loadRecentMaps();
    };

    const handleMapSelect = async () => {
        // TODO: Map selection logic (backend currently only supports "current" map from upload)
        // For now, we might need an endpoint to "set current map" or re-upload it
        // Re-uploading is a safe cheat for now given the backend structure
        alert('Selecting previously uploaded maps is not fully supported yet. Please re-upload the file.');
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this map?')) return;
        try {
            await deleteFile(id);
            await loadRecentMaps();
            if (mapLayout.value?.id === id) {
                mapLayout.value = null; // Clear if deleted current
            }
        } catch (err) {
            console.error('Failed to delete map', err);
            alert('Failed to delete map');
        }
    };

    const handleRename = async (id: string, newName: string) => {
        try {
            await renameFile(id, newName);
            await loadRecentMaps();
        } catch (err) {
            console.error('Failed to rename map', err);
            alert('Failed to rename map');
        }
    };

    return (
        <div class="view-container">
            {!mapLayout.value ? (
                <div class="map-placeholder">
                    <h2>No Map Loaded</h2>
                    <p>Upload a conveyor map XML file to get started.</p>
                    <div class="upload-container">
                        <FileUpload
                            onUploadSuccess={handleUploadSuccess}
                            uploadFn={uploadMapLayout}
                            accept=".xml"
                            maxSize={50 * 1024 * 1024} // 50MB for maps
                        />
                    </div>
                </div>
            ) : (
                <>
                    <div class="map-toolbar">
                        <div class="toolbar-left">
                            <h3>{mapLayout.value.name || 'Conveyor Map'}</h3>
                        </div>
                        <div class="toolbar-right">
                            {/* Add toolbar actions here */}
                        </div>
                    </div>
                    <MapCanvas />
                </>
            )}

            <div class="recent-maps-sidebar">
                <RecentFiles
                    files={recentMaps}
                    onFileSelect={handleMapSelect}
                    onFileDelete={handleDelete}
                    onFileRename={handleRename}
                />
            </div>

            <style>{`
                .view-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    width: 100%;
                    position: relative;
                }
                .map-placeholder {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: var(--spacing-md);
                    color: var(--text-secondary);
                    padding: var(--spacing-xl);
                }
                .upload-container {
                    width: 100%;
                    max-width: 500px;
                }
                .map-toolbar {
                    padding: var(--spacing-sm) var(--spacing-md);
                    background: var(--bg-secondary);
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .map-toolbar h3 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                }
                
                /* Sidebar overlay for recent maps when no map is loaded */
                .recent-maps-sidebar {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 300px;
                    top: 0;
                    background: var(--bg-secondary);
                    border-right: 1px solid var(--border-color);
                    z-index: 10;
                    display: ${mapLayout.value ? 'none' : 'flex'}; 
                    flex-direction: column;
                }
            `}</style>
        </div>
    );
}
