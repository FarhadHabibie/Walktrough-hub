package com.walkthroughhub.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugin (not an npm package): the bridge picks it up by name.
        registerPlugin(GamefaqsCapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
