// Shorthand
if (typeof(Cc) == "undefined")
  var Cc = Components.classes;
if (typeof(Ci) == "undefined")
  var Ci = Components.interfaces;
if (typeof(Cu) == "undefined")
  var Cu = Components.utils;
if (typeof(Cr) == "undefined")
  var Cr = Components.results;

try{
  Cu.import("resource://app/components/sbProperties.jsm");
}catch(e){}
try{
  Cu.import("resource://app/jsmodules/sbProperties.jsm");
}catch(e){}
Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
try{
  Cu.import("resource://app/jsmodules/sbCoverHelper.jsm");
}catch(e){}

if (typeof(gMM) == "undefined"){
  try{
    gMM = Components.classes["@songbirdnest.com/Songbird/Mediacore/Manager;1"]  
                     .getService(Components.interfaces.sbIMediacoreManager);
  }
  catch(e){}
}
/**
 * Media Page Controller
 *
 * In order to display the contents of a library or list, pages
 * must provide a "window.mediaPage" object implementing
 * the Songbird sbIMediaPage interface. This interface allows
 * the rest of Songbird to talk to the page without knowledge
 * of what the page looks like.
 *
 * In this particular page most functionality is simply
 * delegated to the sb-playlist widget.
 */
window.mediaPage = {
  // The sbIMediaListView that this page is to display
  _mediaListView: null,
  _mainLibrary: null,
  _mediaList: null,
  // The sb-playlist XBL binding
  _playlist: null,
  // Album Art Service
  _albumArtService: null,
  
  // The flow XBL binding
  _flow: null,
  // Flow Vars
  canSelect : false,
  albums : null,
  _ignoreSelect : false,
  _toSelect : null,
  defaultCover: "chrome://songbird/skin/album-art/default-cover.png",
  state: "",
  search: "",
  //
  /**
   * Gets the sbIMediaListView that this page is displaying
   */
  get mediaListView()  {
    return this._mediaListView;
  },
  /**
   * Set the sbIMediaListView that this page is to display.
   * Called in the capturing phase of window load by the Songbird browser.
   * Note that to simplify page creation mediaListView may only be set once.
   */
  set mediaListView(value)  {
    if (!this._mediaListView) {
      this._mediaListView = value;
    } else {
      throw new Error("mediaListView may only be set once.  Please reload the page");
    }
  },

  /* Used in the fullscreen view */
  _beforeOnLoad: function MF_beforeOnLoad(){

  },

  /**
   * Called when a key is pressed while the playlist is focused.
   * This is used to scroll the flow left and right while it is not focused
   * If the flow is focused the flow binding will handle the scrolling
   */
  onPlaylistKeyPress: function(event){
    //Don't move if they are editing
    if (window.mediaPage._playlist.tree.editingRow==-1){
      var KeyEvent = Ci.nsIDOMKeyEvent;
      switch(event.keyCode){
        case KeyEvent.DOM_VK_LEFT:
          window.mediaPage._flow.handleOffset(1);
          break;
        case KeyEvent.DOM_VK_RIGHT:
          window.mediaPage._flow.handleOffset(-1);
          break;
      }
    }
  },
  /**
   * Called when the page finishes loading.
   * By this time window.mediaPage.mediaListView should have
   * been externally set.
   */
  onLoad:  function MF_onLoad(e) {
    // Make sure we have the javascript modules we're going to use
    dump("on load\n");
    if (!window.SBProperties)
      Cu.import("resource://app/jsmodules/sbProperties.jsm");
    if (!window.LibraryUtils)
      Cu.import("resource://app/jsmodules/sbLibraryUtils.jsm");
    if (!window.kPlaylistCommands)
      Cu.import("resource://app/jsmodules/kPlaylistCommands.jsm");

    this._beforeOnLoad();

    if (!this._mediaListView) {
      Components.utils.reportError("Media Page did not receive  " +
                                   "a mediaListView before the onload event!");
      /* Create a new one from the Library. Useful when testing in the
         DOM Inspector and such */
      this.mediaListView = LibraryUtils.mainLibrary.createView();
    }
    
    this._mainLibrary = this._mediaListView.mediaList.library;
    this._mediaList = this._mediaListView.mediaList;
    //Listen for items added, removed, and modified in this list
    this._mediaList.addListener(this);
    var view = this._mediaListView;
    Album.prototype.ignoreAlbumArtist = Application.prefs.getValue("extensions."+this.shortname+".ignoreAlbumArtist", false)
    var selectedItem = view.selection.currentMediaItem;
    if (selectedItem){
      this._currentAlbum = new Album(selectedItem)
    }
    
    /* Attach context menu */
    this.context.init(null);

    /* Resize the canvas when the page resizes */
    window.addEventListener('resize',function(event){window.mediaPage.onResize(event);},false);
    
    //We need to wait a bit, don't flip songbird out. The sort can take some time.
    let (self = this){
      setTimeout(function(){
        self.initViewElement();    
        self.mediaListView.addListener(self);
        self._initPlaylist();
        self._getAlbums();
      },0);
    }
  },

  /**
   * Called as the window is about to unload
   */
  onUnload:  function MF_onUnload(e) {
    this.initiated = false;
    if (this._mediaList)
      this._mediaList.removeListener(this);
    if (this.mediaListView)
      this.mediaListView.removeListener(this);
    this.unloadViewElement();
    
    if (this._playlist) {
      this._playlist.removeEventListener("keypress",this.onPlaylistKeyPress,true);
      this._playlist.getListView().selection.removeListener(this);
      this._playlist.destroy();
      this._playlist = null;
    }
  },

  /**
   * Show/highlight the MediaItem at the given MediaListView index.
   * Called by the Find Current Track button.
   */
  highlightItem: function MF_highlightItem(aIndex) {
    this._playlist.highlightItem(aIndex);
  },

  /**
   * Called when something is dragged over the tabbrowser tab for this window
   */
  canDrop: function MF_canDrop(aEvent, aSession) {
    return this._playlist.canDrop(aEvent, aSession);
  },

  /**
   * Called when something is dropped on the tabbrowser tab for this window
   */
  onDrop: function MF_onDrop(aEvent, aSession) {
    return this._playlist.
        _dropOnTree(this._playlist.mediaListView.length,
                Ci.sbIMediaListViewTreeViewObserver.DROP_AFTER);
  },
  
  /*
   Selects the items in the album
  */
  _selectMediaInItem: function MF_selectMediaInItem(aItem,aSingleSelect){
    var view = this._playlist.getListView();
    
    var firstIndex = view.length;
    var lastIndex = -1;
    var items = view.mediaList.getItemsByProperty(aItem.property, aItem.name);
    var itr = items.enumerate();
    if (!aSingleSelect)
      view.selection.selectNone();
    while (itr.hasMoreElements()){
      var mediaitem = itr.getNext();
      try{
        //Make sure this is part of the same album
        if (buildItem(mediaitem,aItem.property).equals(aItem)){
          var i = view.getIndexForItem(mediaitem);
          if (i<firstIndex)
            firstIndex = i;
          if (i>lastIndex)
            lastIndex = i;
          if (!aSingleSelect)
            view.selection.select(i);
        }
      }catch(e){
        //dump("MF: "+e+"\n");
      }
    }
    try{
      if (aSingleSelect)
        view.selection.selectOnly(firstIndex);
      var tree = this._playlist.tree;
      if (firstIndex != lastIndex )
        tree.treeBoxObject.ensureRowIsVisible(lastIndex);
      tree.treeBoxObject.ensureRowIsVisible(firstIndex);
    } catch (e){
      dump("selectItemsInAlbumErr: "+e+"\n")
    }
  },
  _isSortedByTrack: function MF_isSortedByTrack(){
    var sort = this.mediaListView.currentSort;
    var sortby = sort.getPropertyAt(0).id;
    return (sortby == SBProperties.trackName);
  },
  /*
   This is called after an album has been selected in the playlist to scroll to
   the album in the mediaflow view
  */
  selectAlbum : function MF_selectAlbum(aMediaItem){
    var mAlbum = new Album(aMediaItem);
    this._currentAlbum = mAlbum;
    this.selectAlbumInViewEle(mAlbum,aMediaItem);
  },
  
  /*
   play the first track in the currently selected group. If it is alread playing,
   cycle through the other tracks in the group and play the next track
  */
  play: function ML_play(aCurrent){
    var playView = window.mediaPage.mediaListView;
    var index = -1;//Ci.sbIMediacoreSequencer.AUTO_PICK_INDEX;
    var playing = gMM.sequencer.currentItem?(new Artist(gMM.sequencer.currentItem)):null;
    //dump("prop: "+aCurrent.property+", "+aCurrent.name+"\n");
    var items = playView.mediaList.getItemsByProperty(aCurrent.property, aCurrent.name);
    //if (gMM.sequencer && gMM.sequencer.view == playView){
    var itr = items.enumerate();
    var firstIndex = playView.length;
    var firstItem = null;
    var playingIndex = -1;
    try{
      if (playView == gMM.sequencer.view)
        playingIndex = gMM.sequencer.viewPosition;
    }catch(e){}
    var playIndex = -1;
    while (itr.hasMoreElements()){
      var item = itr.getNext();
      var i = this.mediaListView.getIndexForItem(item);
      if (i<firstIndex){
        firstIndex = i;
        firstItem = item;
      }
      if (i > playingIndex && (i<playIndex || playIndex==-1)){
        playIndex = i;
      }
    }
    if (playIndex==-1)
      index = firstIndex;
    else
      index = playIndex;
    //}
    //if (index == -1)
    //  index = items.queryElementAt(0,Ci.sbIMediaItem);
    this._playlist.tree.treeBoxObject.ensureRowIsVisible(index);
    gMM.sequencer.playView(playView, index);
  },
  
  /* remove items from the medialist that belong to the passed in album
    this will also need to be changed to adjust for multiple albums with the same
    name
  */
  removeAlbum: function MF_removeAlbum(aAlbum){
    var view = this._playlist.getListView();
    var items = view.mediaList.getItemsByProperty(
                               SBProperties.albumName, aAlbum.name);
    var itr = items.enumerate();
    while (itr.hasMoreElements()){
      var item = itr.getNext();
      if (new Album(item).equals(aAlbum)){//Make sure it is from the same album/artist
        view.mediaList.remove(item);
      }
    }
  },

  /* select the items in the group and then open the edit metadata window
     will need to be modified to support multiple same named albums
  */
  editItem: function MF_editItem(aItem){
    this._ignoreSelect = true;
    this._selectMediaInItem(aItem, false);
    this._ignoreSelect = false;

    SBTrackEditorOpen("edit");
  },
  
  /**
   * returns an nsISimpleEnumerator of the items in the given album,
   * excludes albums with the same name but different artists
   */
  getMediaInGroup: function MF_getMediaInGroupa(aGroup){
    var items = this.mediaListView.mediaList.getItemsByProperty(
                               aGroup.property, aGroup.name);
    var itr = items.enumerate();
    var array = Components.classes["@mozilla.org/array;1"]
                  .createInstance(Components.interfaces.nsIMutableArray);

    while (itr.hasMoreElements()){
      var item = itr.getNext();
      if (buildItem(item,aGroup.property).equals(aGroup)){//Make sure it is from the same album/artist
        //albumItems.push(item);
        array.appendElement(item,false);
      }
    }
    
    return array.enumerate();
  },
  
  /*
   Gets the album art url stored by songbird for the mediaitem
   This also checks to see if the album holds the default cover image for the
   album art manager extension because clearing album art with that extension
   didn't clear it, it replaced it with the aam's default.
  */
  _getAlbumArtFromMediaItem: function MF_getAlbumArtFromMediaItem(aMediaItem){
    var mAlbumArtUrl = null;
    if (aMediaItem)
      mAlbumArtUrl = aMediaItem.getProperty(SBProperties.primaryImageURL);
    var aamNoCover = "chrome://albumartmanager/skin/no-cover.png";
    if (!this._albumArtService && mAlbumArtUrl == aamNoCover){
      mAlbumArtUrl = null;
    }
    try{  
      var ios = Components.classes["@mozilla.org/network/io-service;1"].
            getService(Components.interfaces.nsIIOService);
      var fileurl = ios.newURI(mAlbumArtUrl, null, null);
      if (fileurl instanceof Components.interfaces.nsIFileURL && !fileurl.file.exists())
        mAlbumArtUrl = null;
    }catch(e){
      
    }
    if (mAlbumArtUrl == null || mAlbumArtUrl == "") {
      if (this._albumArtService){
        // We don't have a cover for this yet so get the albumArtService to check
        // if it exists on the file system already.
        mAlbumArtUrl = this._albumArtService.getAlbumArtWork(aMediaItem, true);
      } else {
        mAlbumArtUrl = this.defaultCover;
      }
    }
    return mAlbumArtUrl;
  },

  /*
    loads the albums in the medialist
  */
  _getAlbums: function MF_getAlbums(aState){
    aState=aState?aState:this;
    //dump("getAlbums: "+aState.state+"\n");
    var len = this._mediaList.length;
    var view = this.view.mediaListView;
    aState.state = "loading";
    let (mf = this){
      this._toSelect = this._currentAlbum;
      function loadAlbums(){
        var count=0, limit=5, changeLength = 30, changeLimit=3;
        for (var i = 0;i<len;i++){
          try{
            if (!mf.initiated){
              aState.state = "clear";
              yield -1;
            }
            var item = view.getItemByIndex(i);
            if (mf._addAlbum(item, i)){
              count++;
              if (count>=limit){
                count=0;
                if (limit!=changeLimit && i>changeLength)
                  limit = changeLimit;
                yield true;
              }
            }
          }catch(e){
            //dump(i+") "+e+"\n");
          }
        }
        aState.state = "loaded";
        yield -1;
      }
      mf.albums = loadAlbums();
      function increment(){
        if (mf.initiated && mf.albums){
          if (mf.albums.next()!=-1){
            setTimeout(function(){
              increment();
            },0)
          } else {
            mf.albums.close();
            mf.albums = null;
          }
        } else {
          if (mf.albums){
            mf.albums.close();
          }
          mf.albums = null;
        }
      }
      increment();    
    }
  },
  
  _processAlbumChanged : function MF_processAlbumChanged(aAlbum){
    if (aAlbum && aAlbum.name!=""){
      var items = null;
      try{
        items = this._mediaListView.mediaList.getItemsByProperty(
                              SBProperties.albumName, aAlbum.name);
      }catch(e){}
      var length = 0;
      //We need to compute the length manually because there may be
      //several albums with the same name but different artists
      if (items){
        var itr = items.enumerate();
        //stop if the length is 2 because we are only interesting in
        //finding out if the last modified album was the last remaining track
        //belonging to this album
        while (itr.hasMoreElements() && length<5){
          var item = itr.getNext();
          if (new Album(item).equals(aAlbum)){
            length++;
          }
        }
      }
      if (!items || length<1){
        this.removeAlbumFromViewEle(aAlbum);
      }
    }
  },

  /* sbIMediaListListener */
  onItemAdded: function MFL_onItemAded(aMediaList, aMediaItem, aIndex){
    /* add this album to the flow if it is missing */
    try{
    var aAlbum = new Album(aMediaItem);
    //dump("mAlbum: "+mAlbum+"\n");
    if (aAlbum && aAlbum.name!=null && aAlbum.name !=""){
      var view = this.mediaListView;
      var len = view.length;
      var pAlbum = null;
      var index = -1;
      
      for (var i = 0;i<len && (aIndex==-1 || i<=aIndex);i++){
        var item = view.getItemByIndex(i);
        var mAlbum = new Album(item);
        if (mAlbum!="" && !mAlbum.equals(pAlbum)){
          index++;
        }
        if (aAlbum.equals(mAlbum)){
          return;
        }
        pAlbum = mAlbum;
      }
      this._insertAlbum(aMediaItem, index);
    }
    }catch(e){
      dump("added err: "+e+"\n")
    }
  },

  onBeforeItemRemoved: function MFL_onBeforeItemRemoved(aMediaList, aMediaItem,
                                                                        aIndex){
    return true;
  },

  onAfterItemRemoved: function MFL_onAfterItemRemoved(aMediaList, aMediaItem,
                                                                      aIndex){
    var mAlbum = new Album(aMediaItem);
    this._processAlbumChanged(mAlbum);
  },

  onItemUpdated: function MFL_onItemUpdated(aMediaList, aMediaItem, aProperties){
    var props = {};
    //Build a map with name,value pairs
    for (var i = 0; i<aProperties.length; i++){//Look through the list of properties that were changed
      var prop = aProperties.getPropertyAt(i);
      props[prop.id] = prop.value;
    }
    
    //Build album with newest data first
    var oldalbum = new Album(aMediaItem);
    var albumChanged = false;
    //See if there is older data to replace the new data with
    if (props[SBProperties.albumName]!=null){
      oldalbum.name = props[SBProperties.albumName];
      albumChanged = true;
    }
    if (props[SBProperties.albumArtistName]!=null && props[SBProperties.albumArtistName]!=""){
      oldalbum.artist = props[SBProperties.albumArtistName];
      albumChanged = true;
    } else if (props[SBProperties.artistName]!=null){
      oldalbum.artist = props[SBProperties.artistName];
      albumChanged = true;
    }
    /* are there still albums with this old album? If not, remove it */
    if (albumChanged){
      this._processAlbumChanged(oldalbum);
      this.onItemAdded(aMediaList, aMediaItem,
                       this.mediaListView.getIndexForItem(aMediaItem));
    } //onItemAdded will handle updating the album image
    else if (props[SBProperties.primaryImageURL]!=null){
      this.updateAlbumImage(aMediaItem);
    }
  },

  onItemMoved: function MFL_onItemMoved(aMediaList, aFromIndex, aToIndex){
    return true;
  },

  onListCleared: function MFL_onListCleared(aMediaList){
    return true;
  },

  onBatchBegin: function MFL_onBatchBegin(aMediaList){
    this._inBatch = true;
  },

  onBatchEnd: function MFL_onBatchEnd(aMediaList){
    this._inBatch = false;
  },

  toString: function(){
    return "media page\n";
  },

  /* sbIMediaListViewListener */
  onFilterChanged: function MFVL_onFilterChanged(aView){
  },
  onSearchChanged: function MFVL_onSearchChanged(aView){
    if (aView!=window.mediaPage.mediaListView)
      return;
    try{
    //dump("onsearchchangd1\n");
    var terms = [];
    var search = aView.searchConstraint;
    if (search){
      var groupCount = search.groupCount;
      for (var i = 0; i < groupCount; i++) {
        var group = search.getGroup(i);
        var property = group.properties.getNext();
        terms.push(group.getValues(property).getNext());
      }
    } else {
      
    }
    window.mediaPage.search = terms.join(" ");
    var filters = window.mediaPage.view.mediaListView.cascadeFilterSet;
    var len = filters.length;
    for (var j=0;j<len;j++){
      if (filters.isSearch(j)){
        try{
          filters.set(j,terms,terms.length);
        }catch(e){
          
        }
        //Only one search in a filterset
        break;
      }
    }
    }catch(e){
      Components.utils.reportError(e);
    }
  },
  onSortChanged: function MFVL_onSortChanged(aChangedView){
    
  },
  
  QueryInterface: function MF_QueryInterface(iid) {
    if (!iid.equals(Ci.sbILocalDatabaseAsyncGUIDArrayListener) &&
        !iid.equals(Ci.sbIAlbumArtListener) &&
        !iid.equals(Ci.sbIMediaListViewListener) &&
        !iid.equals(Ci.nsISupportsWeakReference) &&
        !iid.equals(Ci.nsISupports))
      throw Cr.NS_ERROR_NO_INTERFACE;
    return this;
  }
}
window.mediaPage.context = {
  get parent(){return window.mediaPage},
  sbCommands: null,
  item: null,
  _fetchers : [],
  init: function MFC_Init(aCommands){
    //var target = this.parent.getContextTarget();
    //target.setAttribute("context",this.parent.shortname+"-view-context");
    var menu = document.getElementById(this.parent.shortname+"-view-context");

    var play = document.getElementById("library_cmd_play");
    var remove = document.getElementById("library_cmd_remove");
    var edit = document.getElementById("library_cmd_edit");
    play.label = SBString("command.play");
    remove.label = SBString("command.remove");
    edit.label = SBString("command.edit");
    
    //if (!this.parent._albumArtService){
    //  document.getElementById("mediaflow-menu-getartwork").hidden = true;
    //  document.getElementById("mediaflow-menu-clearartwork").hidden = true;
    //  document.getElementById("mediaflow-aam-options").hidden = true;
    //}
  },
  uninit: function MFC_Uninit(){
    //this.sbCommands.destroy();
    this.parent = null;
  },
  refreshCommands: function MFC_RefreshCommands(){
    //this.sbCommands.refreshCommands(true);
  },
  onShowing: function MFC_onShowing(aEvent){
    var info = this.parent.getClickInfo(aEvent);
    this.parent.view.select(document.popupNode);
    if (info){
      this.item = info.item;
      this.mediaitem = info.mediaitem;
    } else
      return false;
    return true;
  },
  onShown: function MFC_onShown(aEvent){
    //this.sbCommands.setDeferRefresh();
  },
  onHidden: function MFC_onHidden(aEvent){
    //this.sbCommands.clearDeferRefresh();
  },
  playItem: function MFC_playItem(aEvent){
    /* perform action will call the main playAlbum */
    this.parent.play(this.item);
    //this.selectIndex(this.mediaitem);
  },
  removeItem: function MFC_removeItem(aEvent){
    this.parent.removeItem(this.item);
  },
  editItem: function MFC_editItem(aEvent){
    this.parent.editItem(this.item);
  },
  getCover: function MFC_getCover(aEvent){
    var enume = this.parent.getMediaInGroup(this.item);
    sbCoverHelper.getArtworkForItems(enume, null);
  },
  clearCover: function MFC_clearCover(aEvent){
    var items = this.parent.getMediaInGroup(this.item);
    while (items.hasMoreElements()){
      var item = items.getNext();
      item.setProperty(SBProperties.primaryImageURL,"");
    }
  }
}
var AlbumViewUtils = window.mediaPage;
function Album(arg1,artist,albumartist) {
  //The name of the album
  this.name = "";
  //The album artist property or, if that is null, the artist
  this.artist = "";
  if (typeof arg1 == 'string'){
    this.name = arg1;
    if (typeof artist == 'string')
      if (typeof albumartist == 'string' && albumartist!="")
        this.artist = albumartist;
      else
        this.artist = artist;
  } else if (arg1!=null) {//a media item was passed in
    this.name = arg1.getProperty(SBProperties.albumName);
    this.artist = arg1.getProperty(SBProperties.albumArtistName);
    if (this.ignoreAlbumArtist || (!this.artist || this.artist == ""))
      this.artist = arg1.getProperty(SBProperties.artistName);
  } else {
    dump(arguments.callee.caller.name+"\n");
  }
}
Album.prototype.property = SBProperties.albumName;
Album.prototype.ignoreAlbumArtist = false;
Album.prototype.equals = function A_equals(aAlbum){
  if (aAlbum!=null){
    if (Album.prototype.ignoreAlbumArtist)
      return aAlbum.name == this.name;
    else
      return typeof this == typeof aAlbum && aAlbum && aAlbum.name == this.name && aAlbum.artist == this.artist;
  }
  return false;
}
function Artist(arg1){
  if (typeof arg1 == "string"){
    this.name = arg1;
  } else if (typeof arg1!="undefined" && arg1) {//MediaItem hopefully...
    this.name = arg1.getProperty(SBProperties.artistName);
  } else{
    this.name = null;
    dump(arguments.callee.caller.name+"\n");
  }
}
Artist.prototype.property = SBProperties.artistName;
Artist.prototype.equals = function Art_equals(aArtist){
  return typeof this == typeof aArtist && aArtist && this.name == aArtist.name;
}
function buildItem(aItem, aProperty){
  if (aProperty == Album.prototype.property)
    return new Album(aItem);
  else if (aProperty == Artist.prototype.property){
    return new Artist(aItem);
  }
}