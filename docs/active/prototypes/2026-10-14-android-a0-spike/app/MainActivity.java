package com.youcoded.a0spike;
import android.app.Activity; import android.os.Bundle; import android.widget.*; import java.io.*;
public class MainActivity extends Activity {
  TextView tv;
  @Override protected void onCreate(Bundle b) {
    super.onCreate(b);
    ScrollView sv = new ScrollView(this); tv = new TextView(this); tv.setTextSize(10); tv.setTextIsSelectable(true); sv.addView(tv); setContentView(sv);
    new Thread(this::run).start();
  }
  void log(String s) { runOnUiThread(() -> tv.append(s + "\n")); android.util.Log.i("A0", s); }
  void copyAsset(String path, File dest) throws IOException {
    String[] kids = getAssets().list(path);
    if (kids != null && kids.length > 0) { dest.mkdirs(); for (String k : kids) copyAsset(path + "/" + k, new File(dest, k)); return; }
    try (InputStream in = getAssets().open(path); OutputStream out = new FileOutputStream(dest)) { in.transferTo(out); }
  }
  void run() {
    try {
      File f = getFilesDir();
      for (String a : new String[]{"pt","ca-certificates.crt","libmap.txt","test.sh"}) copyAsset(a, new File(f, a));
      ProcessBuilder pb = new ProcessBuilder("/system/bin/sh", new File(f, "test.sh").getPath());
      pb.environment().put("NL", getApplicationInfo().nativeLibraryDir);
      pb.environment().put("F", f.getPath());
      pb.redirectErrorStream(true);
      Process p = pb.start();
      BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()));
      String line; while ((line = r.readLine()) != null) log(line);
      log("SCRIPT EXIT " + p.waitFor());
    } catch (Exception e) { log("JAVA ERROR " + e); }
  }
}
