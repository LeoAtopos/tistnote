package app.tistnote.android;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.text.InputType;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.core.content.FileProvider;
import androidx.documentfile.provider.DocumentFile;
import androidx.webkit.WebViewAssetLoader;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
    private static final String START = "https://appassets.androidplatform.net/assets/index.html";
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private WebView web; private FrameLayout root; private Pending pending; private boolean compatible = true;
    private static final class Pending {
        final String id, command; final JSONObject data;
        Pending(String id, String command, JSONObject data) { this.id=id; this.command=command; this.data=data; }
    }
    private boolean dark() { return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private File libraries() { File directory = new File(getFilesDir(), "libraries"); directory.mkdirs(); return directory; }
    private File folder(String id) throws IOException {
        try { if (!UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException(); }
        catch (IllegalArgumentException error) { throw new IOException("Invalid library identifier"); }
        File directory = new File(libraries(), id); if (!directory.isDirectory()) throw new IOException("Library no longer exists"); return directory;
    }
    private JSONObject info(String id) throws Exception {
        LocalVault files = new LocalVault(folder(id)); String text = files.read(".tistnote/android-library.json");
        if (text == null) throw new IOException("Library name is missing");
        return new JSONObject().put("id", id).put("name", new JSONObject(text).getString("name"));
    }
    private String stamp() { return new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(new Date()) + "-" + UUID.randomUUID().toString().substring(0,8); }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        root = new FrameLayout(this); web = new WebView(this); root.addView(web, new FrameLayout.LayoutParams(-1,-1)); setContentView(root);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
        applyTheme(dark());
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view,insets)->{
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int keyboard = insets.getInsets(WindowInsets.Type.ime()).bottom;
                view.setPadding(bars.left,bars.top,bars.right,Math.max(bars.bottom,keyboard)); return insets;
            });
        }
        WebSettings settings=web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new Bridge(),"TistnoteAndroid");
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient(){
            @Override public void onPageFinished(WebView view,String url){
                view.evaluateJavascript("Boolean(window.crypto && crypto.randomUUID && Intl.Segmenter && Array.prototype.at)",value->{
                    if(!"true".equals(value)){
                        compatible=false;
                        boolean zh=getResources().getConfiguration().getLocales().get(0).getLanguage().equals("zh");
                        LinearLayout notice=new LinearLayout(MainActivity.this);notice.setOrientation(LinearLayout.VERTICAL);notice.setPadding(dp(24),dp(40),dp(24),dp(24));
                        TextView text=new TextView(MainActivity.this);text.setTextSize(20);text.setText(zh?"请启用或更新 Android System WebView，然后重新打开品记。":"Enable or update Android System WebView, then reopen Tistnote.");notice.addView(text);
                        Button close=new Button(MainActivity.this);close.setTextSize(22);close.setText(zh?"关闭":"Close");close.setOnClickListener(button->finish());notice.addView(close);
                        root.removeAllViews();root.addView(notice);
                    }
                });
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response=assets.shouldInterceptRequest(request.getUrl());
                if(response==null)return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
                Map<String,String> headers=new HashMap<>();
                headers.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'");
                response.setResponseHeaders(headers); return response;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                if("https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&uri.getPath()!=null&&uri.getPath().startsWith("/assets/"))return false;
                if(request.isForMainFrame()&&"https".equals(uri.getScheme())&&("github.com".equals(uri.getHost())||"leoatopos.github.io".equals(uri.getHost()))){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(ActivityNotFoundException ignored){}
                }
                return true;
            }
        });
        web.loadUrl(START);
    }
    @SuppressWarnings("deprecation") private void applyTheme(boolean dark) {
        int background=Color.parseColor(dark?"#161e19":"#fafaf7"); root.setBackgroundColor(background); web.setBackgroundColor(background);
        getWindow().setStatusBarColor(background); getWindow().setNavigationBarColor(background);
        if(Build.VERSION.SDK_INT>=30){WindowInsetsController controller=getWindow().getInsetsController();if(controller!=null)controller.setSystemBarsAppearance(dark?0:WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);}
        else getWindow().getDecorView().setSystemUiVisibility(dark?0:View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    }
    private void answer(String id,Object value,Throwable error) {
        try{
            JSONObject response=new JSONObject().put("id",id).put("ok",error==null).put("value",value==null?JSONObject.NULL:value);
            if(error!=null)response.put("error",error.getMessage()==null?error.getClass().getSimpleName():error.getMessage());
            String script="window.dispatchEvent(new CustomEvent('tistnote-android-response',{detail:"+response+"}));";
            runOnUiThread(()->{if(!isDestroyed())web.evaluateJavascript(script,null);});
        }catch(JSONException ignored){}
    }
    private final class Bridge {
        @JavascriptInterface public void call(String id,String command,String payload) {
            worker.execute(()->{
                try{
                    if(id.length()>80||payload.length()>48_000_000)throw new IOException("Request is too large");
                    JSONObject data=new JSONObject(payload);
                    if(Arrays.asList("pickLibrary","backup","restore","import","exportImages").contains(command)){
                        runOnUiThread(()->openPicker(new Pending(id,command,data)));return;
                    }
                    Object value=null;
                    switch(command){
                        case "startup": {String saved=getPreferences(MODE_PRIVATE).getString("library",null);value=saved==null?null:info(saved);break;}
                        case "remember": getPreferences(MODE_PRIVATE).edit().putString("library",data.getString("vault")).apply();break;
                        case "theme": runOnUiThread(()->applyTheme(data.optBoolean("dark")));break;
                        case "finish": runOnUiThread(()->finish());break;
                        case "copyImage": copyImage(data.getString("data"),id);return;
                        default:{
                            LocalVault files=new LocalVault(folder(data.getString("vault")));
                            String path=data.getString("path");
                            switch(command){
                                case "read":value=files.read(path);break;
                                case "write":files.write(path,data.getString("text"));break;
                                case "mkdir":files.mkdir(path);break;
                                case "remove":files.remove(path);break;
                                case "walk":{LocalVault.Tree tree=files.walk(path);value=new JSONObject().put("files",new JSONArray(tree.files)).put("directories",new JSONArray(tree.directories));break;}
                                default:throw new IOException("Unknown Android operation");
                            }
                        }
                    }
                    answer(id,value,null);
                }catch(Exception error){answer(id,null,error);}
            });
        }
    }
    private void styleDialog(AlertDialog dialog) {
        for(int button:new int[]{AlertDialog.BUTTON_POSITIVE,AlertDialog.BUTTON_NEGATIVE,AlertDialog.BUTTON_NEUTRAL})if(dialog.getButton(button)!=null)dialog.getButton(button).setTextSize(22);
    }
    private TextView title(String text) {TextView title=new TextView(this);title.setText(text);title.setTextSize(24);title.setPadding(dp(24),dp(22),dp(24),dp(16));return title;}
    private void openPicker(Pending request) {
        if(pending!=null){answer(request.id,null,new IOException("Another system dialog is already open"));return;}
        pending=request;
        try{
            boolean zh="zh".equals(request.data.optString("language"));
            if(request.command.equals("pickLibrary")){chooseLibrary(request,zh);return;}
            Intent intent;
            if(request.command.equals("backup"))intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/zip").putExtra(Intent.EXTRA_TITLE,"tistnote-backup-"+stamp()+".zip");
            else if(request.command.equals("exportImages"))intent=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            else intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(request.command.equals("restore")?"application/zip":"*/*");
            startActivityForResult(intent,701);
        }catch(Exception error){pending=null;answer(request.id,null,error);}
    }
    private void chooseLibrary(Pending request,boolean zh) throws Exception {
        List<JSONObject> libraries=new ArrayList<>(); File[] children=libraries().listFiles();
        if(children!=null)for(File child:children)if(child.isDirectory())try{libraries.add(info(child.getName()));}catch(Exception ignored){}
        List<String> names=new ArrayList<>();for(JSONObject library:libraries)names.add(library.getString("name"));
        names.add(zh?"新建资料库":"New library");
        ArrayAdapter<String> adapter=new ArrayAdapter<String>(this,android.R.layout.simple_list_item_1,names){@Override public View getView(int position,View convert,ViewGroup parent){TextView row=(TextView)super.getView(position,convert,parent);row.setTextSize(20);row.setMinHeight(dp(56));return row;}};
        AlertDialog dialog=new AlertDialog.Builder(this).setCustomTitle(title(zh?"选择资料库":"Choose a library")).setAdapter(adapter,(d,index)->{
            if(index==libraries.size()){newLibrary(request,zh,names);return;}
            pending=null;answer(request.id,libraries.get(index),null);
        }).setNegativeButton(zh?"取消":"Cancel",(d,which)->{pending=null;answer(request.id,null,null);}).setOnCancelListener(d->{pending=null;answer(request.id,null,null);}).create();
        dialog.show();styleDialog(dialog);
    }
    private void newLibrary(Pending request,boolean zh,List<String> occupied) {
        LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(24),0,dp(24),0);
        EditText input=new EditText(this);input.setSingleLine(true);input.setTextSize(20);input.setInputType(InputType.TYPE_CLASS_TEXT);input.setHint(zh?"资料库名称":"Library name");input.setText(zh?"我的品记":"My Tistnote");body.addView(input);
        TextView error=new TextView(this);error.setTextSize(20);error.setTextColor(Color.rgb(190,80,80));body.addView(error);
        AlertDialog dialog=new AlertDialog.Builder(this).setCustomTitle(title(zh?"新建资料库":"New library")).setView(body).setPositiveButton(zh?"创建":"Create",null).setNegativeButton(zh?"取消":"Cancel",(d,w)->{pending=null;answer(request.id,null,null);}).setOnCancelListener(d->{pending=null;answer(request.id,null,null);}).create();
        dialog.setOnShowListener(d->{styleDialog(dialog);dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view->{
            String name=input.getText().toString().trim();
            if(name.isEmpty()||name.length()>100){error.setText(zh?"请输入 1–100 字的名称":"Enter a name of 1–100 characters");return;}
            if(occupied.contains(name)){error.setText(zh?"资料库名称已存在":"This library name is already in use");return;}
            dialog.dismiss();pending=null;
            worker.execute(()->{try{String id=UUID.randomUUID().toString();LocalVault files=new LocalVault(new File(libraries(),id));files.write(".tistnote/android-library.json",new JSONObject().put("name",name).toString());answer(request.id,info(id),null);}catch(Exception failure){answer(request.id,null,failure);}});
        });});dialog.show();
    }
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent result) {
        super.onActivityResult(requestCode,resultCode,result);if(requestCode!=701||pending==null)return;
        Pending request=pending;pending=null;
        if(resultCode!=RESULT_OK||result==null||result.getData()==null){answer(request.id,null,null);return;}
        Uri uri=result.getData();
        worker.execute(()->{
            try{
                Object value;
                switch(request.command){
                    case "backup":try(OutputStream output=getContentResolver().openOutputStream(uri,"wt")){if(output==null)throw new IOException("Cannot create backup");new LocalVault(folder(request.data.getString("vault"))).backup(output);}value=uri.getLastPathSegment();break;
                    case "restore":value=restore(uri);break;
                    case "import":try(InputStream input=getContentResolver().openInputStream(uri)){if(input==null)throw new IOException("Cannot open Markdown");byte[] bytes=readLimited(input,LocalVault.MAX_FILE);value=StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString();}break;
                    case "exportImages":value=exportImages(uri,request.data.getJSONArray("pages"));break;
                    default:throw new IOException("Unknown document operation");
                }
                answer(request.id,value,null);
            }catch(Exception error){answer(request.id,null,error);}
        });
    }
    private byte[] readLimited(InputStream input,int limit) throws IOException {
        ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[32768];int count,total=0;
        while((count=input.read(buffer))!=-1){total+=count;if(total>limit)throw new IOException("File exceeds size limit");output.write(buffer,0,count);}return output.toByteArray();
    }
    private JSONObject restore(Uri uri) throws Exception {
        File archive=File.createTempFile("restore-",".zip",getCacheDir());String id=UUID.randomUUID().toString();File directory=new File(libraries(),id);
        try{
            try(InputStream input=getContentResolver().openInputStream(uri);OutputStream output=new FileOutputStream(archive)){
                if(input==null)throw new IOException("Cannot read backup");byte[] buffer=new byte[32768];int length;long total=0;
                while((length=input.read(buffer))!=-1){total+=length;if(total>256L*1024*1024)throw new IOException("Backup exceeds 256 MB");output.write(buffer,0,length);}
            }
            LocalVault files=new LocalVault(directory);files.restore(archive);
            String manifest=files.read(".tistnote/manifest.json");if(new JSONObject(manifest).getInt("schema")!=1)throw new IOException("Unsupported library version");
            String name="Tistnote-restored-"+stamp();files.write(".tistnote/android-library.json",new JSONObject().put("name",name).toString());return info(id);
        }catch(Exception error){deleteNewDirectory(directory);throw error;}
        finally{archive.delete();}
    }
    private void deleteNewDirectory(File directory) throws IOException {
        Path allowed=libraries().toPath().toAbsolutePath().normalize(),target=directory.toPath().toAbsolutePath().normalize();
        if(!target.getParent().equals(allowed))throw new IOException("Invalid restore cleanup path");
        if(Files.exists(target))try(java.util.stream.Stream<Path> paths=Files.walk(target)){Iterator<Path> iterator=paths.sorted(Comparator.reverseOrder()).iterator();while(iterator.hasNext())Files.delete(iterator.next());}
    }
    private byte[] png(String data) throws IOException {
        if(!data.startsWith("data:image/png;base64,")||data.length()>40_000_000)throw new IOException("Invalid or oversized PNG");
        byte[] bytes=android.util.Base64.decode(data.substring(22),android.util.Base64.DEFAULT);
        byte[] signature={(byte)137,80,78,71,13,10,26,10};if(bytes.length<8||!Arrays.equals(Arrays.copyOf(bytes,8),signature))throw new IOException("Invalid PNG");return bytes;
    }
    private String exportImages(Uri tree,JSONArray pages) throws Exception {
        if(pages.length()<1||pages.length()>200)throw new IOException("Export requires 1–200 images");
        DocumentFile parent=DocumentFile.fromTreeUri(this,tree);if(parent==null||!parent.canWrite())throw new IOException("Folder is not writable");
        String name="Tistnote-"+stamp();DocumentFile directory=parent.createDirectory(name);if(directory==null)throw new IOException("Cannot create image folder");
        for(int index=0;index<pages.length();index++){
            DocumentFile file=directory.createFile("image/png",String.format(Locale.ROOT,"tistnote-%03d.png",index+1));if(file==null)throw new IOException("Image export incomplete: "+name);
            try(OutputStream output=getContentResolver().openOutputStream(file.getUri(),"wt")){if(output==null)throw new IOException("Image export incomplete: "+name);output.write(png(pages.getString(index)));}
        }
        return name;
    }
    private void copyImage(String data,String id) throws Exception {
        File directory=new File(getCacheDir(),"shared");directory.mkdirs();File file=new File(directory,"tistnote-"+stamp()+".png");
        try(OutputStream output=new FileOutputStream(file)){output.write(png(data));}
        Uri uri=FileProvider.getUriForFile(this,getPackageName()+".files",file);
        runOnUiThread(()->{try{((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newUri(getContentResolver(),"Tistnote",uri));answer(id,null,null);}catch(RuntimeException error){answer(id,null,error);}});
    }
    @Override public void onBackPressed() { handleBack(); }
    private void handleBack() {
        if(!compatible){finish();return;}
        web.evaluateJavascript("(function(){const dialogs=[...document.querySelectorAll('dialog[open]')];if(dialogs.length){dialogs.at(-1).dispatchEvent(new Event('cancel',{cancelable:true,bubbles:true}));return;}const back=document.querySelector('.notes-layout.show-editor .back-button');if(back&&back.getClientRects().length){back.click();return;}window.dispatchEvent(new Event('tistnote-android-close'));})()",null);
    }
    @Override protected void onPause(){if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('tistnote-android-pause'));",null);super.onPause();}
    @Override protected void onDestroy(){worker.shutdown();if(web!=null){web.removeJavascriptInterface("TistnoteAndroid");web.destroy();}super.onDestroy();}
}
