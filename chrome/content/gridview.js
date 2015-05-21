window.mediaPage.shortname = "gridview";
window.mediaPage.view = null;
window.mediaPage.initViewElement = function MF_initiateElement(){
  //setup the binding
  this.view = document.getElementById("birdview");
  this.view.defaultImage = {};
  this.view.defaultImage.url = this._getAlbumArtFromMediaItem(null);
  
  //this._artistFilter = this._mediaListView.cascadeFilterSet.appendFilter(SBProperties.artistName);
  this._artistFilter = null;
    
  var filters = window.mediaPage.mediaListView.cascadeFilterSet;
  var len = filters.length;
  for (var i=0;i<len;i++){
    if (filters.getProperty(i) == SBProperties.artistName){
      this._artistFilter = i;
      var blank = [];
      try{
        filters.set(i,blank,0);
      }catch(e){
        
      }
      break;
    }
  }
  if (this._artistFilter==null){
    this._artistFilter = filters.appendFilter(SBProperties.artistName);
  }
  
  this.sort();
  try{
    this.view.mediaListView = this.mediaListView.clone();
  } catch(e){
    this.view.mediaListView = this.mediaListView.mediaList.createView();
  }
  //this.view.mediaListView.addListener(this.view.listener);
  
  this.initiated = true;
}
window.mediaPage.sort = function MF_sort(){
  var current = this.mediaListView.currentSort;
  if (current.length>=2 && current.getPropertyAt(0).id==SBProperties.artistName &&
      current.getPropertyAt(1).id==SBProperties.albumName)
    return;
  var array = Cc["@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1"]
                .createInstance(Ci.sbIMutablePropertyArray);
  array.strict = false;
  array.appendProperty(SBProperties.artistName, "a");
  array.appendProperty(SBProperties.albumName, "a");
  this.mediaListView.setSort(array);
}
//We don't display any filters in the artist view
window.mediaPage._initPlaylist = function(){
  this._playlist = document.getElementById("playlist");
  //get the commands to use to bind the playlist
  var mgr =
    Components.classes["@songbirdnest.com/Songbird/PlaylistCommandsManager;1"]
              .createInstance(Components.interfaces.sbIPlaylistCommandsManager);
  var cmds = mgr.request(kPlaylistCommands.MEDIAITEM_DEFAULT);
  this._playlist.bind(this.mediaListView, cmds);
}


window.mediaPage.unloadViewElement = function MF_unloadElement(){
  var filters = window.mediaPage.mediaListView.cascadeFilterSet;
  filters.clearAll();
  var len = filters.length;
  for (var i=len-1;i>=0;i--){
    filters.remove(i);
  }
}
/* called when resized by the splitter or when the containing window is resized */
window.mediaPage.onResize = function AV_onResize(event){
  if (this.view.canRefresh){
    var orient = 1;
    if (event.type == "resize" && event.eventPhase == 2){
      orient = -1;
    }
    this.view.refresh(orient);
  }
}

/* get the index of an album name in the flow
    this will need to be modified to adapt to multiple albums of the same name
  */
window.mediaPage._getAlbumIndexInViewEle = function MF_getAlbumIndexInFlow(aAlbum, aMediaItem){
  var index = -1;
  return index;
}
window.mediaPage.selectAlbumInViewEle = function MF_selectAlbumInViewEle(mAlbum,aMediaItem){
  var index = this._getAlbumIndexInViewEle(mAlbum,this._isSortedByTrack()?aMediaItem:null);
  //if (index != -1)
    //this._flow.glideToIndex(index);
  //else //not found
  //  this._toSelect = mAlbum;
  
}
/*
  Creates the album item passed to the view object for the album associated with
  this mediaitem. The album item is used to keep track of all information the
  flow will need to know about a specific album
*/
window.mediaPage._getAlbumItemFromMediaItem = function MF_getAlbumItemFromMediaItem(aMediaItem){
  if (!aMediaItem)
    return null;
  var item = new Album(aMediaItem);
  if (item.name == null || item.name == "") {
    item.name = "";
    if (!item.artist || item.artist == "")
      return null;
  }
  

  item.node=aMediaItem;
  item.image = this._getAlbumArtFromMediaItem(aMediaItem);
  return item;
}
/*
  Add the album associated with this mediaitem to the end of the view
*/
window.mediaPage._addAlbum = function MF_addAlbum(aMediaItem) {
  var item = this._getAlbumItemFromMediaItem(aMediaItem);
  if (item){
    if (!item.equals(this._prev)){
      this.view.addAlbum(item);
      this._prev = item;
      return true;
    }
  }
  return false;
}

/* inserts the album associated with this mediaitem at the aIndex */
window.mediaPage._insertAlbum = function MF_insertAlbum(aMediaItem, aIndex){
  var item = this._getAlbumItemFromMediaItem(aMediaItem);
  if (item){

  }
}

/* The view will take care of most of this, just convert froma mediaitem to an album */
window.mediaPage.updateAlbumImage = function MF_updateAlbumImage(aMediaItem){
  var item = this._getAlbumItemFromMediaItem(aMediaItem);
  if (item){
    this.view.updateAlbumImage(item);
  }
}
/**
 * This is called when the filter, search, or sort changes. 
 */
window.mediaPage._updateView = function MF_updateView(aChangedView){
  if (this.albums){
    this.albums.close();
    this.albums = null;
  }
  
  //this.view.clear();
  //this._getAlbums();
}
window.mediaPage.getContextTarget = function (){return document.getElementById("birdview");}
window.mediaPage.getClickInfo = function MF_getClickInfo(aEvent){
  var item = this.view.getClickTarget(aEvent);
  var ret = null;
  if (item){
    ret = {};
    ret.item = item.item;
    ret.mediaitem = item.mediaitem;
  } 
  return ret;
}
window.mediaPage._getItemGroup = function MF_getItemGroup(aMediaItem){
  return new Album(aMediaItem);
}