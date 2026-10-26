package app.tistnote.android;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.*;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;
import java.util.zip.*;

/** Private application files use atomic replacement; exported backups contain the desktop library layout. */
public final class LocalVault {
    public static final int MAX_FILE = 64 * 1024 * 1024;
    private final Path root;
    public LocalVault(File directory) throws IOException { root = directory.toPath().toAbsolutePath().normalize(); Files.createDirectories(root); }
    private Path resolve(String relative) throws IOException {
        if (relative == null || relative.isEmpty() || relative.startsWith("/") || relative.contains("\\") || relative.indexOf('\0') >= 0) throw new IOException("Invalid library path");
        for (String part : relative.split("/", -1)) if (part.isEmpty() || part.equals(".") || part.equals("..")) throw new IOException("Invalid library path");
        Path path = root.resolve(relative).normalize();
        if (!path.startsWith(root)) throw new IOException("Path escapes library");
        for (Path at = path; at != null && at.startsWith(root); at = at.getParent()) if (Files.isSymbolicLink(at)) throw new IOException("Symbolic links are not supported");
        return path;
    }
    public String read(String path) throws IOException {
        Path file = resolve(path);
        if (!Files.exists(file)) return null;
        if (Files.size(file) > MAX_FILE) throw new IOException("File exceeds 64 MB");
        return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(Files.readAllBytes(file))).toString();
    }
    public void mkdir(String path) throws IOException { Files.createDirectories(resolve(path)); }
    public void write(String path, String text) throws IOException {
        ByteBuffer encoded = StandardCharsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).encode(java.nio.CharBuffer.wrap(text));
        byte[] bytes = new byte[encoded.remaining()]; encoded.get(bytes);
        if (bytes.length > MAX_FILE) throw new IOException("File exceeds 64 MB");
        Path file = resolve(path); Files.createDirectories(file.getParent());
        Path temp = Files.createTempFile(file.getParent(), ".tistnote-", ".tmp");
        try {
            try (FileChannel channel = FileChannel.open(temp, StandardOpenOption.WRITE)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes); while (buffer.hasRemaining()) channel.write(buffer); channel.force(true);
            }
            Files.move(temp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally { Files.deleteIfExists(temp); }
    }
    public void remove(String path) throws IOException { Files.deleteIfExists(resolve(path)); }
    public static final class Tree { public final List<String> files = new ArrayList<>(), directories = new ArrayList<>(); }
    public Tree walk(String path) throws IOException {
        Tree tree = new Tree(); Path start = resolve(path); if (!Files.exists(start)) return tree;
        try (Stream<Path> stream = Files.walk(start)) {
            Iterator<Path> iterator = stream.iterator();
            while (iterator.hasNext()) {
                Path item = iterator.next(); if (item.equals(start)) continue;
                if (Files.isSymbolicLink(item)) throw new IOException("Symbolic links are not supported");
                String name = root.relativize(item).toString().replace(File.separatorChar, '/');
                (Files.isDirectory(item) ? tree.directories : tree.files).add(name);
            }
        }
        Collections.sort(tree.files); Collections.sort(tree.directories); return tree;
    }
    public void backup(OutputStream output) throws IOException {
        try (ZipOutputStream zip = new ZipOutputStream(output); Stream<Path> stream = Files.walk(root)) {
            long total = 0;
            Iterator<Path> iterator = stream.iterator();
            while (iterator.hasNext()) {
                Path file = iterator.next(); if (file.equals(root)) continue;
                if (Files.isSymbolicLink(file)) throw new IOException("Symbolic links are not supported");
                String relative = root.relativize(file).toString().replace(File.separatorChar, '/');
                if (file.getFileName().toString().startsWith(".tistnote-") || relative.equals(".tistnote/vault.lock")) continue;
                if (!Files.isDirectory(file)) { long size = Files.size(file); total += size; if (size > MAX_FILE || total > 256L * 1024 * 1024) throw new IOException("Backup exceeds Android's 256 MB restore limit"); }
                zip.putNextEntry(new ZipEntry(relative + (Files.isDirectory(file) ? "/" : "")));
                if (!Files.isDirectory(file)) Files.copy(file, zip); zip.closeEntry();
            }
        }
    }
    public void restore(File archive) throws IOException {
        try (Stream<Path> files = Files.list(root)) { if (files.findAny().isPresent()) throw new IOException("Restore requires a new library"); }
        try (ZipFile zip = new ZipFile(archive)) {
            String prefix = "";
            if (zip.getEntry(".tistnote/manifest.json") == null) {
                Enumeration<? extends ZipEntry> candidates = zip.entries(); List<String> roots = new ArrayList<>();
                while (candidates.hasMoreElements()) { String name = candidates.nextElement().getName(); if (name.endsWith("/.tistnote/manifest.json")) roots.add(name.substring(0, name.length() - ".tistnote/manifest.json".length())); }
                if (roots.size() != 1) throw new IOException("Not a complete Tistnote backup"); prefix = roots.get(0);
            }
            Enumeration<? extends ZipEntry> entries = zip.entries(); Set<String> seen = new HashSet<>(); long total = 0; int count = 0;
            byte[] buffer = new byte[32768];
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement(); String name = entry.getName();
                if (++count > 10000) throw new IOException("Too many backup entries");
                if (!prefix.isEmpty() && name.equals(prefix)) continue;
                if (!name.startsWith(prefix)) throw new IOException("Unexpected backup root"); name = name.substring(prefix.length());
                if (entry.isDirectory() && name.endsWith("/")) name = name.substring(0, name.length() - 1);
                Path destination = resolve(name);
                if (!(name.equals("notes") || name.startsWith("notes/") || name.equals(".tistnote") || name.startsWith(".tistnote/")) || !seen.add(name)) throw new IOException("Invalid backup entry");
                if (name.equals(".tistnote/vault.lock")) continue;
                if (entry.isDirectory()) { Files.createDirectories(destination); continue; }
                Files.createDirectories(destination.getParent()); long size = 0;
                try (InputStream input = zip.getInputStream(entry); OutputStream output = Files.newOutputStream(destination, StandardOpenOption.CREATE_NEW)) {
                    int length; while ((length = input.read(buffer)) != -1) { size += length; total += length; if (size > MAX_FILE || total > 256L * 1024 * 1024) throw new IOException("Backup exceeds size limit"); output.write(buffer, 0, length); }
                }
            }
            if (!Files.isRegularFile(root.resolve(".tistnote/manifest.json"))) throw new IOException("Missing library manifest");
        }
    }
}
