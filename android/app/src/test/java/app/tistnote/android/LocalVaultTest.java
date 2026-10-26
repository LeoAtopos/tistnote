package app.tistnote.android;

import org.junit.Test;
import org.junit.Rule;
import org.junit.rules.TemporaryFolder;
import java.io.*;
import java.nio.file.*;
import java.util.zip.*;
import static org.junit.Assert.*;

public class LocalVaultTest {
    @Rule public TemporaryFolder temp = new TemporaryFolder();
    @Test public void atomicUtf8AndPaths() throws Exception {
        File directory=temp.newFolder();LocalVault vault=new LocalVault(directory);
        vault.write("notes/生活/one.md","\ufeff喜欢与讨厌\n原因 🎵");
        assertEquals("\ufeff喜欢与讨厌\n原因 🎵",vault.read("notes/生活/one.md"));
        try{vault.write("notes/生活/one.md","broken\ud800");fail("Invalid UTF-16 must not change the file");}catch(java.nio.charset.CharacterCodingException expected){}
        assertEquals("\ufeff喜欢与讨厌\n原因 🎵",vault.read("notes/生活/one.md"));
        for(String path:new String[]{"../outside","/absolute","notes/../escape","notes\\escape","notes//two","notes/./two"}){
            try{vault.write(path,"bad");fail(path);}catch(IOException expected){}
        }
        assertEquals(1,vault.walk("notes").files.size());
        try{vault.remove("notes/生活");fail("Nonempty group must be preserved");}catch(IOException expected){}
        assertNotNull(vault.read("notes/生活/one.md"));
        vault.remove("notes/生活/one.md");assertNull(vault.read("notes/生活/one.md"));
    }
    @Test public void zipPreservesFilesEmptyGroupsAndOmitsNativeLock() throws Exception {
        File original=temp.newFolder();LocalVault source=new LocalVault(original);
        source.write(".tistnote/manifest.json","{\"schema\":1}");source.write("notes/choice.md","好恶\n");source.write(".tistnote/vault.lock","locked");source.mkdir("notes/empty");
        byte[] binary={0,(byte)255,5,8};Files.write(new File(original,"notes/data.bin").toPath(),binary);
        File archive=temp.newFile("backup.zip");source.backup(new FileOutputStream(archive));
        LocalVault restored=new LocalVault(temp.newFolder());restored.restore(archive);
        assertEquals("好恶\n",restored.read("notes/choice.md"));assertNull(restored.read(".tistnote/vault.lock"));assertTrue(restored.walk("notes").directories.contains("notes/empty"));
        try{restored.read("notes/data.bin");fail("Binary data must not be decoded with replacement");}catch(java.nio.charset.CharacterCodingException expected){}
        try{restored.restore(archive);fail("Cannot restore over existing files");}catch(IOException expected){}
    }
    @Test public void zipTraversalAndDuplicateEntriesCannotEscape() throws Exception {
        File outside=temp.newFile("keep.txt");Files.write(outside.toPath(),new byte[]{9});
        File archive=temp.newFile("malicious.zip");
        try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(archive))){
            zip.putNextEntry(new ZipEntry(".tistnote/manifest.json"));zip.write("{\"schema\":1}".getBytes(java.nio.charset.StandardCharsets.UTF_8));zip.closeEntry();
            zip.putNextEntry(new ZipEntry("../keep.txt"));zip.write(new byte[]{1});zip.closeEntry();
        }
        LocalVault target=new LocalVault(temp.newFolder());try{target.restore(archive);fail("Path traversal was accepted");}catch(IOException expected){}
        assertArrayEquals(new byte[]{9},Files.readAllBytes(outside.toPath()));
    }
    @Test public void wrappedDesktopFolderBackupIsSupported() throws Exception {
        File archive=temp.newFile("desktop.zip");
        try(ZipOutputStream zip=new ZipOutputStream(new FileOutputStream(archive))){
            zip.putNextEntry(new ZipEntry("My library/.tistnote/manifest.json"));zip.write("{\"schema\":1}".getBytes(java.nio.charset.StandardCharsets.UTF_8));zip.closeEntry();
            zip.putNextEntry(new ZipEntry("My library/notes/a.md"));zip.write("note".getBytes(java.nio.charset.StandardCharsets.UTF_8));zip.closeEntry();
        }
        LocalVault target=new LocalVault(temp.newFolder());target.restore(archive);assertEquals("note",target.read("notes/a.md"));
    }
}
