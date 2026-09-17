// Violation fixture for folders-service-called-by-both-transports: a transport
// that calls four of the five service functions — setFolderDescription is
// only mentioned in a comment and declared locally, which does not count.
import { listPickerFolders, addFolder, removeFolder, renameFolder } from './folders-service';
// setFolderDescription(path, text) used to be called here
function setFolderDescription(p: string, d: string) { return [p, d]; }
export function handle(type: string, p: any) {
  if (type === 'list') return listPickerFolders();
  if (type === 'add') return addFolder(p.folderPath, p.nickname);
  if (type === 'remove') return removeFolder(p.folderPath);
  if (type === 'rename') return renameFolder(p.folderPath, p.nickname);
  return setFolderDescription;
}
