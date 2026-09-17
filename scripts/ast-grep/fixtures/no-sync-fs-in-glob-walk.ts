// Violation fixture for no-sync-fs-in-glob-walk.
export async function glob(root: string): Promise<void> {
  await fs.promises.stat(root);
  const walk = async (dir: string): Promise<void> => {
    for (const name of fs.readdirSync(dir)) await walk(name);
  };
  await walk(root);
}
