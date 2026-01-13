import { FileUpload } from '../components/file/FileUpload'
import { RecentFiles } from '../components/file/RecentFiles'
import type { FileInfo } from '../models/types'

interface HomeViewProps {
    recentFiles: FileInfo[]
    onUploadSuccess: (file: FileInfo) => void
    onFileSelect: (file: FileInfo) => void
    onFileDelete: (id: string) => void
}

export function HomeView({ recentFiles, onUploadSuccess, onFileSelect, onFileDelete }: HomeViewProps) {
    return (
        <div class="home-layout">
            <FileUpload onUploadSuccess={onUploadSuccess} />

            <RecentFiles
                files={recentFiles}
                onFileSelect={onFileSelect}
                onFileDelete={onFileDelete}
            />

            <style>{`
        .home-layout {
          max-width: 800px;
          margin: 0 auto;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--spacing-xl);
        }
      `}</style>
        </div>
    )
}
